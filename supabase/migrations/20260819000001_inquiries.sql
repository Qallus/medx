-- ============================================================
-- Medical X Scottsdale — Website enquiries
-- Backs the Contact page form and the site-wide appointment modal.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── INQUIRIES ────────────────────────────────────────────
-- One row per submitted form. Written only by the send-inquiry
-- Edge Function using the service-role key.
CREATE TABLE inquiries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  first_name     text        NOT NULL,
  last_name      text        NOT NULL,
  email          text        NOT NULL,
  phone          text        NOT NULL,

  service        text,
  visit_type     text,
  preferred_date date,
  preferred_time text,
  message        text,

  -- 'contact' (Contact.html) or 'modal' (site-wide appointment dialog)
  source         text        NOT NULL DEFAULT 'contact',
  page_url       text,

  -- Delivery bookkeeping: the row is committed before the notification
  -- is attempted, so a mail failure can never lose an enquiry.
  notified_at    timestamptz,
  notify_error   text,

  -- Retained for rate limiting and abuse triage only.
  ip_address     inet,
  user_agent     text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Newest first, for the dashboard and for the per-IP rate limit window.
CREATE INDEX inquiries_created_at_idx  ON inquiries (created_at DESC);
CREATE INDEX inquiries_ip_recent_idx   ON inquiries (ip_address, created_at DESC);

-- Surfaces enquiries the notification email never reached.
CREATE INDEX inquiries_undelivered_idx ON inquiries (created_at DESC)
  WHERE notified_at IS NULL;

-- ─── ROW-LEVEL SECURITY ───────────────────────────────────
-- RLS is enabled with NO policies, which denies every request made with
-- the anon or authenticated key. That is deliberate: the public site never
-- touches this table directly, it posts to the send-inquiry Edge Function,
-- which uses the service-role key and bypasses RLS. Leaking the anon key
-- in page source therefore exposes nothing here.
--
-- Adding a read policy later (e.g. for Dashboard.html) requires real auth
-- first - do not open this to anon.
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE inquiries IS
  'Website enquiry submissions. Service-role writes only; RLS denies anon and authenticated.';
