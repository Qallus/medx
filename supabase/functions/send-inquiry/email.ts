// Branded notification email for the clinic.
//
// Written as tables with inline styles on purpose. Outlook renders with Word's
// HTML engine, which ignores flexbox, grid, and most <style> blocks, so the
// modern CSS the website uses would collapse there. Everything here is the
// conservative subset that survives Outlook, Gmail and Apple Mail alike.
//
// The logo must be an absolute https URL - relative paths and data: URIs are
// blocked or stripped by most clients (Gmail refuses data: images outright).

export interface InquiryEmailData {
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

export function renderInquiryEmail(d: InquiryEmailData, logoUrl: string): string {
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
export function renderInquiryText(d: InquiryEmailData): string {
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
