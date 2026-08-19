// send-inquiry — receives a website enquiry, stores it, then notifies the clinic.
//
// The row is committed BEFORE the email is attempted, and the response does not
// depend on the email succeeding. Notification mail to a consumer ISP mailbox
// will fail sometimes; when it does we still hold the enquiry, flagged by
// notify_error and surfaced by the inquiries_undelivered_idx index.
//
// Runs with verify_jwt = false because visitors are anonymous. Abuse is handled
// by a honeypot field and a per-IP rate limit rather than by auth.

import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Per-IP submission cap. Generous enough that a household behind one NAT
// address is unaffected, tight enough that this is not a usable mail relay.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;

const MAX_LENGTHS: Record<string, number> = {
  first_name: 100,
  last_name: 100,
  email: 254,
  phone: 40,
  service: 120,
  visit_type: 120,
  preferred_time: 60,
  message: 5000,
  page_url: 500,
  user_agent: 500,
};

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  // With no allowlist configured, fall back to "*" so the form works during
  // client review. Set ALLOWED_ORIGINS once the real domains are live.
  const allow = ALLOWED_ORIGINS.length === 0
    ? "*"
    : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function clean(value: unknown, field: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const max = MAX_LENGTHS[field] ?? 500;
  return trimmed.slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Deliberately permissive: rejecting an unusual but valid address costs a real
// enquiry, which is far worse than accepting one that later bounces.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  // Honeypot: a hidden field no human ever sees. Bots fill every input, so a
  // value here means a bot. Return success so it has nothing to tune against.
  if (clean(payload.company, "company")) {
    return json({ ok: true }, 200, origin);
  }

  const first_name = clean(payload.first_name, "first_name");
  const last_name = clean(payload.last_name, "last_name");
  const email = clean(payload.email, "email");
  const phone = clean(payload.phone, "phone");

  for (const [field, value] of Object.entries({ first_name, last_name, email, phone })) {
    if (!value) return json({ error: `Missing required field: ${field}` }, 400, origin);
  }
  if (!looksLikeEmail(email!)) {
    return json({ error: "Please enter a valid email address." }, 400, origin);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ip = clientIp(req);

  if (ip) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count, error } = await supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", since);

    // A failed rate-limit check must never block a genuine enquiry.
    if (error) {
      console.error("rate limit check failed:", error.message);
    } else if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return json(
        { error: "Too many submissions. Please call us at (480) 219-0055." },
        429,
        origin,
      );
    }
  }

  const source = clean(payload.source, "source") === "modal" ? "modal" : "contact";
  const preferredDate = clean(payload.preferred_date, "preferred_date");
  const service = clean(payload.service, "service");
  const visitType = clean(payload.visit_type, "visit_type");
  const preferredTime = clean(payload.preferred_time, "preferred_time");
  const message = clean(payload.message, "message");

  const { data: inquiry, error: insertError } = await supabase
    .from("inquiries")
    .insert({
      first_name,
      last_name,
      email,
      phone,
      service,
      visit_type: visitType,
      preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(preferredDate ?? "") ? preferredDate : null,
      preferred_time: preferredTime,
      message,
      source,
      page_url: clean(payload.page_url, "page_url"),
      ip_address: ip,
      user_agent: clean(req.headers.get("user-agent"), "user_agent"),
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("insert failed:", insertError.message);
    return json(
      { error: "We could not save your request. Please call (480) 219-0055." },
      500,
      origin,
    );
  }

  // ─── Notify the clinic ───────────────────────────────────
  // Past this point the enquiry is safe. Any failure below is recorded on the
  // row and never surfaced to the visitor as a failed submission.
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const notifyTo = Deno.env.get("NOTIFY_TO");
  const notifyFrom = Deno.env.get("NOTIFY_FROM");

  if (!apiKey || !notifyTo || !notifyFrom) {
    const msg = "Mail not configured (RESEND_API_KEY / NOTIFY_TO / NOTIFY_FROM)";
    console.error(msg);
    await supabase.from("inquiries").update({ notify_error: msg }).eq("id", inquiry.id);
    return json({ ok: true, id: inquiry.id }, 200, origin);
  }

  const fullName = `${first_name} ${last_name}`;
  const rows: Array<[string, string | null]> = [
    ["Name", fullName],
    ["Email", email],
    ["Phone", phone],
    ["Interested in", service],
    ["Visit type", visitType],
    ["Preferred date", preferredDate],
    ["Preferred time", preferredTime],
    ["Submitted from", source === "modal" ? "Appointment modal" : "Contact page"],
  ];

  const detailHtml = rows
    .filter(([, v]) => v)
    .map(([label, value]) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#666;white-space:nowrap;">${label}</td>` +
      `<td style="padding:6px 0;color:#111;"><strong>${escapeHtml(value!)}</strong></td></tr>`
    )
    .join("");

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;">` +
    `<h2 style="margin:0 0 4px;font-size:18px;">New website enquiry</h2>` +
    `<p style="margin:0 0 18px;color:#666;font-size:13px;">` +
    `Reply to this email to respond to ${escapeHtml(fullName)} directly.</p>` +
    `<table style="border-collapse:collapse;margin-bottom:18px;">${detailHtml}</table>` +
    (message
      ? `<div style="border-left:3px solid #ddd;padding:2px 0 2px 14px;color:#333;white-space:pre-wrap;">` +
        `<div style="color:#666;font-size:13px;margin-bottom:4px;">Questions and comments</div>` +
        `${escapeHtml(message)}</div>`
      : "") +
    `</div>`;

  const text =
    `New website enquiry\n\n` +
    rows.filter(([, v]) => v).map(([l, v]) => `${l}: ${v}`).join("\n") +
    (message ? `\n\nQuestions and comments:\n${message}` : "");

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Scoped to the row id, so retrying this exact enquiry cannot deliver
        // a second copy within Resend's 24h idempotency window.
        "Idempotency-Key": `inquiry/${inquiry.id}`,
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: [notifyTo],
        // Lets the clinic hit Reply and reach the visitor, while the envelope
        // sender stays on the verified domain.
        reply_to: email,
        subject: `New enquiry — ${fullName}`,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("resend failed:", res.status, body);
      await supabase
        .from("inquiries")
        .update({ notify_error: `${res.status}: ${body}`.slice(0, 1000) })
        .eq("id", inquiry.id);
    } else {
      await supabase
        .from("inquiries")
        .update({ notified_at: new Date().toISOString(), notify_error: null })
        .eq("id", inquiry.id);
    }
  } catch (err) {
    console.error("resend threw:", err);
    await supabase
      .from("inquiries")
      .update({ notify_error: String(err).slice(0, 1000) })
      .eq("id", inquiry.id);
  }

  return json({ ok: true, id: inquiry.id }, 200, origin);
});
