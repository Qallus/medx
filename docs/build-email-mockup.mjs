import fs from "node:fs";
import path from "node:path";
import { renderInquiryEmail, renderInquiryText } from "./email.mts";

const SITE = "c:/Users/jwate/Projects/Medical X Scottsdale";
const OUT = path.join(SITE, "docs/email-mockup.html");

// The artifact CSP blocks remote images, so the preview embeds the logo.
// The real email uses an absolute https URL via LOGO_URL.
const logoB64 = fs.readFileSync(path.join(SITE, "assets/med_x_logo.png")).toString("base64");
const LOGO = `data:image/png;base64,${logoB64}`;

const full = {
  firstName: "Jordan", lastName: "Avery",
  email: "jordan.avery@example.com", phone: "(480) 555-0148",
  service: "Alcohol Detox", visitType: "In person (Scottsdale)",
  preferredDate: "2026-08-24", preferredTime: "Morning (9am\u201312pm)",
  message: "I'd like to understand what the first visit looks like, and whether my insurance is accepted. Mornings are easiest for me.",
  source: "modal", submittedAt: "Aug 19, 2026, 1:42 PM MST",
};

const minimal = {
  firstName: "Sam", lastName: "Reyes", email: "sam.reyes@example.com", phone: "480-555-0199",
  service: null, visitType: null, preferredDate: null, preferredTime: null, message: null,
  source: "contact", submittedAt: "Aug 19, 2026, 2:05 PM MST",
};

/** Pull the email's table markup out of its full document so it can be
 *  embedded in the review page. Drops the hidden preheader, which would
 *  otherwise appear as stray text. */
function inner(html) {
  let b = html.slice(html.indexOf("<body"), html.lastIndexOf("</body>"));
  b = b.slice(b.indexOf(">") + 1);
  return b.replace(/<!-- Preview text[\s\S]*?<\/div>/, "").trim();
}

const emailFull = inner(renderInquiryEmail(full, LOGO));
const emailMin = inner(renderInquiryEmail(minimal, LOGO));
const textPart = renderInquiryText(full);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const page = `<title>Med X Inquiry Email</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,380;8..60,600&family=Public+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --ground:#FAFAF9; --surface:#FFFFFF; --surface-2:#F4F4F2;
    --ink:#141418; --body:#3F3F46; --muted:#74747C; --line:#E5E4E2;
    --accent:#C81939; --accent-soft:#FDF2F4; --good:#157F4B;
    --shadow:0 1px 2px rgba(20,20,24,.05), 0 12px 32px -12px rgba(20,20,24,.18);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#131316; --surface:#1B1B20; --surface-2:#232329;
      --ink:#F3F3F4; --body:#C2C2C9; --muted:#8A8A93; --line:#2E2E35;
      --accent:#F0455F; --accent-soft:#2B1017; --good:#4ADE80;
      --shadow:0 1px 2px rgba(0,0,0,.4), 0 12px 32px -12px rgba(0,0,0,.6);
    }
  }
  :root[data-theme="dark"] {
    --ground:#131316; --surface:#1B1B20; --surface-2:#232329;
    --ink:#F3F3F4; --body:#C2C2C9; --muted:#8A8A93; --line:#2E2E35;
    --accent:#F0455F; --accent-soft:#2B1017; --good:#4ADE80;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 12px 32px -12px rgba(0,0,0,.6);
  }

  * { box-sizing: border-box; }
  body {
    margin:0; background:var(--ground); color:var(--body);
    font-family:"Public Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size:16px; line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:1080px; margin:0 auto; padding:clamp(2rem,5vw,4.5rem) clamp(1rem,4vw,2.5rem) 5rem; }

  h1,h2,h3 { font-family:"Source Serif 4", Georgia, serif; color:var(--ink); font-weight:380; text-wrap:balance; margin:0; }
  h1 { font-size:clamp(2rem,4.4vw,2.9rem); line-height:1.12; letter-spacing:-.015em; }
  h2 { font-size:clamp(1.35rem,2.4vw,1.7rem); line-height:1.25; }
  h3 { font-size:1.08rem; font-weight:600; }
  p { margin:0; }
  a { color:var(--accent); }

  .eyebrow {
    font-family:"IBM Plex Mono", ui-monospace, monospace;
    font-size:.72rem; letter-spacing:.14em; text-transform:uppercase;
    color:var(--accent); font-weight:500;
  }

  header.top { display:flex; flex-direction:column; gap:1rem; padding-bottom:2rem; border-bottom:1px solid var(--line); }
  header.top p.lede { font-size:1.06rem; max-width:62ch; }

  .facts { display:flex; flex-wrap:wrap; gap:.5rem; margin-top:.4rem; }
  .fact {
    display:inline-flex; align-items:baseline; gap:.5rem;
    background:var(--surface); border:1px solid var(--line); border-radius:999px;
    padding:.34rem .82rem; font-size:.82rem;
  }
  .fact b { font-family:"IBM Plex Mono", monospace; font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:500; }
  .fact span { color:var(--ink); font-weight:500; }

  section { margin-top:3.5rem; display:flex; flex-direction:column; gap:1.1rem; }
  section > .head { display:flex; flex-direction:column; gap:.45rem; }
  section > .head p { max-width:66ch; }

  /* The email always renders on a light ground, so the preview locks to
     light regardless of the page theme. */
  .client {
    background:#EEEEEC; border:1px solid var(--line); border-radius:14px;
    padding:clamp(.75rem,2vw,1.5rem); box-shadow:var(--shadow); overflow-x:auto;
  }
  .client-bar {
    background:#FFFFFF; border:1px solid #E4E4E2; border-bottom:0;
    border-radius:10px 10px 0 0; padding:.85rem 1.1rem;
    display:flex; flex-direction:column; gap:.28rem;
    max-width:640px; margin:0 auto;
  }
  .client-bar .row { display:flex; gap:.6rem; font-size:.82rem; line-height:1.45; }
  .client-bar .k {
    font-family:"IBM Plex Mono", monospace; font-size:.7rem; letter-spacing:.08em;
    text-transform:uppercase; color:#8A8A90; min-width:58px; padding-top:.15rem;
  }
  .client-bar .v { color:#141418; }
  .client-bar .v.subject { font-weight:700; }
  .stage { max-width:640px; margin:0 auto; background:#FAFAFA; border:1px solid #E4E4E2; border-radius:0 0 10px 10px; }
  .stage > table { margin:0 auto; }

  .zones { display:grid; grid-template-columns:repeat(auto-fit,minmax(216px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .zone { background:var(--surface); padding:1.15rem 1.25rem; display:flex; flex-direction:column; gap:.4rem; }
  .zone .n { font-family:"IBM Plex Mono",monospace; font-size:.7rem; letter-spacing:.1em; color:var(--accent); text-transform:uppercase; }
  .zone p { font-size:.9rem; color:var(--muted); }

  .split { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; align-items:start; }
  @media (max-width:820px) { .split { grid-template-columns:1fr; } }

  pre.text {
    margin:0; background:var(--surface); border:1px solid var(--line); border-radius:12px;
    padding:1.25rem 1.4rem; overflow-x:auto;
    font-family:"IBM Plex Mono", ui-monospace, monospace; font-size:.8rem; line-height:1.65;
    color:var(--body); white-space:pre;
  }

  table.spec { width:100%; border-collapse:collapse; font-size:.92rem; }
  table.spec th, table.spec td { text-align:left; padding:.72rem .9rem; border-bottom:1px solid var(--line); vertical-align:top; }
  table.spec th {
    font-family:"IBM Plex Mono",monospace; font-size:.7rem; letter-spacing:.1em;
    text-transform:uppercase; color:var(--muted); font-weight:500;
  }
  table.spec td:first-child { font-family:"IBM Plex Mono",monospace; font-size:.82rem; color:var(--ink); white-space:nowrap; }
  table.spec tr:last-child td { border-bottom:0; }
  .spec-wrap { background:var(--surface); border:1px solid var(--line); border-radius:12px; overflow:hidden; overflow-x:auto; }

  .pill { display:inline-block; padding:.12rem .5rem; border-radius:999px; font-size:.72rem; font-weight:700;
          font-family:"IBM Plex Mono",monospace; letter-spacing:.04em; }
  .pill.set { background:var(--accent-soft); color:var(--accent); }
  .pill.you { background:var(--surface-2); color:var(--body); border:1px solid var(--line); }

  ul.decide { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.9rem; }
  ul.decide li { display:flex; gap:.85rem; background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:0 10px 10px 0; padding:1rem 1.15rem; }
  ul.decide .q { font-weight:700; color:var(--ink); display:block; margin-bottom:.15rem; }
  ul.decide p { font-size:.92rem; }

  .note { font-size:.85rem; color:var(--muted); font-style:italic; }
</style>

<div class="wrap">

  <header class="top">
    <span class="eyebrow">Mockup for review</span>
    <h1>The email Kyra gets when someone submits the form</h1>
    <p class="lede">Every website inquiry sends this. It is generated from the live template in
      <code>supabase/functions/send-inquiry/email.ts</code>, so what you see below is exactly what will arrive &mdash;
      not an impression of it.</p>
    <div class="facts">
      <div class="fact"><b>To</b><span>info@medxscottsdale.com</span></div>
      <div class="fact"><b>From</b><span>Med X Scottsdale &lt;noreply@medxscottsdale.com&gt;</span></div>
      <div class="fact"><b>Reply-to</b><span>the visitor</span></div>
    </div>
  </header>

  <section>
    <div class="head">
      <span class="eyebrow">01 &middot; Complete submission</span>
      <h2>A visitor who filled in everything</h2>
      <p>From the appointment modal, which collects preferred date and time on top of the contact page fields.</p>
    </div>
    <div class="client">
      <div class="client-bar">
        <div class="row"><span class="k">From</span><span class="v">Med X Scottsdale</span></div>
        <div class="row"><span class="k">To</span><span class="v">info@medxscottsdale.com</span></div>
        <div class="row"><span class="k">Subject</span><span class="v subject">New inquiry &mdash; Jordan Avery &middot; Alcohol Detox</span></div>
      </div>
      <div class="stage">${emailFull}</div>
    </div>
  </section>

  <section>
    <div class="head">
      <span class="eyebrow">Anatomy</span>
      <h2>The four zones you asked for</h2>
    </div>
    <div class="zones">
      <div class="zone"><span class="n">Header</span><h3>Logo</h3><p>Med X mark centered on white, linked to the site, with a crimson rule beneath it.</p></div>
      <div class="zone"><span class="n">Body</span><h3>Who and why</h3><p>The visitor's name as the headline, and one line telling Kyra that replying reaches them directly.</p></div>
      <div class="zone"><span class="n">Form content</span><h3>What they submitted</h3><p>Every field as a labelled row. Email and phone are tap-to-act. Optional fields vanish when empty.</p></div>
      <div class="zone"><span class="n">Footer</span><h3>Med X details</h3><p>Address, phone, hours, and a confidentiality reminder on a tinted ground.</p></div>
    </div>
  </section>

  <section>
    <div class="head">
      <span class="eyebrow">02 &middot; Minimum submission</span>
      <h2>When only the required fields are filled</h2>
      <p>Name, email and phone are the only required fields. The optional rows and the comments block drop out
        entirely rather than showing empty labels &mdash; worth checking, since most inquiries will look like this.</p>
    </div>
    <div class="client">
      <div class="client-bar">
        <div class="row"><span class="k">From</span><span class="v">Med X Scottsdale</span></div>
        <div class="row"><span class="k">To</span><span class="v">info@medxscottsdale.com</span></div>
        <div class="row"><span class="k">Subject</span><span class="v subject">New inquiry &mdash; Sam Reyes</span></div>
      </div>
      <div class="stage">${emailMin}</div>
    </div>
  </section>

  <section>
    <div class="head">
      <span class="eyebrow">Plain text</span>
      <h2>The text-only version</h2>
      <p>Sent alongside the HTML. Some clients prefer it, and spam filters treat a missing text part as a
        negative signal &mdash; which matters when the destination is a consumer ISP mailbox.</p>
    </div>
    <pre class="text">${esc(textPart)}</pre>
  </section>

  <section>
    <div class="head">
      <span class="eyebrow">Configuration</span>
      <h2>What is set, and what is yours to set</h2>
    </div>
    <div class="spec-wrap">
      <table class="spec">
        <thead><tr><th>Setting</th><th>Value</th><th>Where</th></tr></thead>
        <tbody>
          <tr><td>NOTIFY_TO</td><td>info@medxscottsdale.com <span class="pill set">confirmed</span></td><td>Supabase secret</td></tr>
          <tr><td>NOTIFY_FROM</td><td>Med X Scottsdale &lt;noreply@medxscottsdale.com&gt;</td><td>Supabase secret</td></tr>
          <tr><td>LOGO_URL</td><td>Defaults to the review domain <span class="pill you">switch at launch</span></td><td>Supabase secret</td></tr>
          <tr><td>RESEND_API_KEY</td><td>Not yet provided <span class="pill you">yours</span></td><td>Supabase secret</td></tr>
          <tr><td>reply_to</td><td>The visitor's own address <span class="pill set">automatic</span></td><td>Per message</td></tr>
        </tbody>
      </table>
    </div>
    <p class="note">In this preview the logo is embedded so it renders offline. The real email links it from
      an absolute https URL &mdash; Gmail and Outlook both refuse embedded images.</p>
  </section>

  <section>
    <div class="head">
      <span class="eyebrow">Needs your call</span>
      <h2>Three things before this goes live</h2>
    </div>
    <ul class="decide">
      <li><div><span class="q">Is the subject line right?</span>
        <p>Currently <em>New inquiry &mdash; Jordan Avery &middot; Alcohol Detox</em>. The service is appended only when
          the visitor picked one, so it stays scannable in a crowded inbox.</p></div></li>
      <li><div><span class="q">Should anyone else be copied?</span>
        <p>It goes to Kyra alone right now. A second recipient or a shared inbox is a one-word change, and it is
          the cheapest insurance against a single mailbox filtering these.</p></div></li>
      <li><div><span class="q">Does the confidentiality line stay?</span>
        <p>The footer notes that the message contains information submitted in confidence. Fitting for a clinic,
          but it is your call whether it belongs on an internal notification.</p></div></li>
    </ul>
  </section>

</div>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
console.log("wrote", OUT, fs.statSync(OUT).size, "bytes");
