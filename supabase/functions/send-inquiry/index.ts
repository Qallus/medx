// send-inquiry — receives a website inquiry, stores it, then notifies the clinic.
//
// The row is committed BEFORE the email is attempted, and the response does not
// depend on the email succeeding. Notification mail to a consumer ISP mailbox
// will fail sometimes; when it does we still hold the inquiry, flagged by
// notify_error and surfaced by the inquiries_undelivered_idx index.
//
// Runs with verify_jwt = false because visitors are anonymous. Abuse is handled
// by a honeypot field and a per-IP rate limit rather than by auth.

import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// ─── Email template ──────────────────────────────────────
// Tables with inline styles: Outlook renders through Word's HTML engine
// and ignores flexbox, grid and most <style> blocks.

interface InquiryEmailData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  service?: string | null;
  visitType?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  message?: string | null;
  source: "contact" | "modal";
  submittedAt: string; // already formatted for display
}

const BRAND = {
  red: "#C81939",
  redDark: "#A6142F",
  ink: "#141418",
  body: "#3F3F46",
  muted: "#71717A",
  line: "#E4E4E7",
  wash: "#FAFAFA",
  softRed: "#FDF2F4",
};

const PHONE = "480-219-0055";
const PHONE_HREF = "tel:4802190055";
const ADDRESS = "11390 E. Via Linda, Ste 103, Scottsdale, AZ 85259";
const SITE = "https://medxscottsdale.com";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "2026-08-24" -> "Mon, Aug 24, 2026". Parsed from the parts rather than
 *  via Date(string), which would treat the value as UTC and can land on the
 *  previous day once rendered in Arizona. */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

/** One label/value row in the submitted-details table. */
function row(label: string, value: string, isLink?: "tel" | "mailto"): string {
  const inner = isLink === "mailto"
    ? `<a href="mailto:${esc(value)}" style="color:${BRAND.red};text-decoration:none;">${esc(value)}</a>`
    : isLink === "tel"
    ? `<a href="tel:${esc(value.replace(/[^0-9+]/g, ""))}" style="color:${BRAND.red};text-decoration:none;">${esc(value)}</a>`
    : esc(value);

  return `
    <tr>
      <td style="padding:11px 16px;border-bottom:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.muted};white-space:nowrap;vertical-align:top;width:150px;">${esc(label)}</td>
      <td style="padding:11px 16px;border-bottom:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${BRAND.ink};font-weight:bold;vertical-align:top;">${inner}</td>
    </tr>`;
}

function renderInquiryEmail(d: InquiryEmailData, logoUrl: string): string {
  const fullName = `${d.firstName} ${d.lastName}`.trim();

  const rows = [
    row("Name", fullName),
    row("Email", d.email, "mailto"),
    row("Phone", d.phone, "tel"),
    d.service ? row("Interested in", d.service) : "",
    d.visitType ? row("Visit type", d.visitType) : "",
    d.preferredDate ? row("Preferred date", formatDate(d.preferredDate)) : "",
    d.preferredTime ? row("Preferred time", d.preferredTime) : "",
    row("Submitted from", d.source === "modal" ? "Appointment modal" : "Contact page"),
    row("Received", d.submittedAt),
  ].join("");

  const messageBlock = d.message
    ? `
      <tr>
        <td style="padding:24px 0 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.softRed};border-left:3px solid ${BRAND.red};border-radius:4px;">
            <tr>
              <td style="padding:16px 18px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.red};font-weight:bold;padding-bottom:8px;">Questions and comments</div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${BRAND.body};white-space:pre-wrap;">${esc(d.message)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>New website inquiry</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.wash};">

<!-- Preview text shown in the inbox list, before the body is opened -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.wash};">
  ${esc(fullName)} &middot; ${esc(d.phone)} &middot; ${esc(d.service || "General inquiry")}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.wash};">
  <tr>
    <td align="center" style="padding:28px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid ${BRAND.line};border-radius:10px;overflow:hidden;">

        <!-- HEADER: logo -->
        <tr>
          <td align="center" style="padding:28px 24px 22px 24px;background-color:#FFFFFF;">
            <a href="${SITE}" style="text-decoration:none;">
              <img src="${esc(logoUrl)}" width="150" alt="Med X Scottsdale" style="display:block;border:0;width:150px;max-width:150px;height:auto;" />
            </a>
          </td>
        </tr>

        <!-- Brand rule -->
        <tr><td style="height:3px;background-color:${BRAND.red};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- BODY -->
        <tr>
          <td style="padding:30px 32px 8px 32px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.red};font-weight:bold;">New website inquiry</div>
            <h1 style="margin:10px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:${BRAND.ink};font-weight:normal;">${esc(fullName)}</h1>
            <p style="margin:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.body};">
              Someone has requested an appointment through the website. Replying to this email goes straight to them.
            </p>
          </td>
        </tr>

        <!-- FORM CONTENT -->
        <tr>
          <td style="padding:22px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:8px;border-collapse:separate;overflow:hidden;">
              ${rows}
            </table>
          </td>
        </tr>

        <!-- MESSAGE -->
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${messageBlock}
            </table>
          </td>
        </tr>

        <!-- ACTIONS -->
        <tr>
          <td style="padding:26px 32px 32px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:6px;background-color:${BRAND.red};">
                  <a href="mailto:${esc(d.email)}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">Reply to ${esc(d.firstName)}</a>
                </td>
                <td style="width:10px;">&nbsp;</td>
                <td style="border-radius:6px;border:1px solid ${BRAND.line};">
                  <a href="tel:${esc(d.phone.replace(/[^0-9+]/g, ""))}" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${BRAND.ink};text-decoration:none;border-radius:6px;">Call them</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 32px 28px 32px;background-color:${BRAND.wash};border-top:1px solid ${BRAND.line};">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;color:${BRAND.ink};padding-bottom:6px;">Med X Scottsdale</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:${BRAND.muted};">
              ${esc(ADDRESS)}<br />
              <a href="${PHONE_HREF}" style="color:${BRAND.muted};text-decoration:none;">${PHONE}</a>
              &nbsp;&middot;&nbsp;
              <a href="${SITE}" style="color:${BRAND.muted};text-decoration:none;">medxscottsdale.com</a><br />
              Mon&ndash;Fri &middot; 9am &ndash; 5pm
            </div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};padding-top:14px;margin-top:14px;border-top:1px solid ${BRAND.line};">
              This notification was generated by the Med X Scottsdale website. It contains information a
              prospective patient submitted in confidence &mdash; please handle it accordingly.
            </div>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

/** Plain-text alternative. Always send both - text-only clients and spam
 *  filters both treat a missing text part as a negative signal. */
function renderInquiryText(d: InquiryEmailData): string {
  const fullName = `${d.firstName} ${d.lastName}`.trim();
  const lines: string[] = [
    "NEW WEBSITE INQUIRY",
    "===================",
    "",
    `Name:            ${fullName}`,
    `Email:           ${d.email}`,
    `Phone:           ${d.phone}`,
  ];
  if (d.service) lines.push(`Interested in:   ${d.service}`);
  if (d.visitType) lines.push(`Visit type:      ${d.visitType}`);
  if (d.preferredDate) lines.push(`Preferred date:  ${formatDate(d.preferredDate)}`);
  if (d.preferredTime) lines.push(`Preferred time:  ${d.preferredTime}`);
  lines.push(`Submitted from:  ${d.source === "modal" ? "Appointment modal" : "Contact page"}`);
  lines.push(`Received:        ${d.submittedAt}`);

  if (d.message) {
    lines.push("", "QUESTIONS AND COMMENTS", "----------------------", d.message);
  }

  lines.push(
    "",
    "Reply to this email to reach them directly.",
    "",
    "--",
    "Med X Scottsdale",
    ADDRESS,
    `${PHONE} · medxscottsdale.com`,
    "Mon-Fri · 9am - 5pm",
  );

  return lines.join("\n");
}


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

// Deliberately permissive: rejecting an unusual but valid address costs a real
// inquiry, which is far worse than accepting one that later bounces.
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

    // A failed rate-limit check must never block a genuine inquiry.
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
  // Past this point the inquiry is safe. Any failure below is recorded on the
  // row and never surfaced to the visitor as a failed submission.
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const notifyTo = Deno.env.get("NOTIFY_TO");
  const notifyFrom = Deno.env.get("NOTIFY_FROM");

  // NOTIFY_TO accepts a comma-separated list, so the clinic mailbox can be
  // copied to someone who will notice if notifications stop arriving.
  const recipients = (notifyTo ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (!apiKey || recipients.length === 0 || !notifyFrom) {
    const msg = "Mail not configured (RESEND_API_KEY / NOTIFY_TO / NOTIFY_FROM)";
    console.error(msg);
    await supabase.from("inquiries").update({ notify_error: msg }).eq("id", inquiry.id);
    return json({ ok: true, id: inquiry.id }, 200, origin);
  }

  const fullName = `${first_name} ${last_name}`;

  // Arizona does not observe DST, so pin the timezone rather than relying on
  // the edge runtime's locale.
  const submittedAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date()) + " MST";

  const emailData = {
    firstName: first_name!,
    lastName: last_name!,
    email: email!,
    phone: phone!,
    service,
    visitType,
    preferredDate,
    preferredTime,
    message,
    source: source as "contact" | "modal",
    submittedAt,
  };

  // Must be an absolute https URL - relative paths and data: URIs do not
  // render in Gmail or Outlook. Point this at the production domain once
  // medxscottsdale.com is live.
  const logoUrl = Deno.env.get("LOGO_URL") ??
    "https://app.medxscottsdale.com/assets/med_x_logo.png";

  const html = renderInquiryEmail(emailData, logoUrl);
  const text = renderInquiryText(emailData);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Scoped to the row id, so retrying this exact inquiry cannot deliver
        // a second copy within Resend's 24h idempotency window.
        "Idempotency-Key": `inquiry/${inquiry.id}`,
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: recipients,
        // Lets the clinic hit Reply and reach the visitor, while the envelope
        // sender stays on the verified domain.
        reply_to: email,
        subject: `New inquiry — ${fullName}${service ? " · " + service : ""}`,
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
