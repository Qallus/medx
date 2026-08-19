# Medical X Scottsdale

Static marketing site for Medical X Scottsdale — hand-authored HTML with a
shared stylesheet and a small amount of vanilla JS. No build step.

## Layout

| Path           | Contents                                                  |
| -------------- | --------------------------------------------------------- |
| `*.html`       | One file per page. `Home.html` is the landing page.        |
| `css/`         | `theme.css` (design tokens, dark default + light mode) and `medx-fields.css` |
| `js/`          | `site.js` (site behaviour) and `medx-fields.js`            |
| `assets/`      | Logos and photography used across the site                 |
| `uploads/`     | Additional images referenced by the interior pages         |
| `screenshots/` | Development reference captures — not shipped in the image  |

## Local preview

Any static server works. The `.vscode/settings.json` here is set up for the
Live Server extension on port 5501, or:

```sh
python -m http.server 5501
```

Then open <http://localhost:5501/Home.html>.

## Deployment (Coolify)

The repo ships a `Dockerfile` that bakes the site into `nginx:1.27-alpine`.

1. In Coolify, create a new **Application** in the target project.
2. Source: this GitHub repository, branch `main`.
3. Build Pack: **Dockerfile** (Coolify picks up the root `Dockerfile`).
4. Port: `80`.
5. Health check path: `/health`.
6. Set the domain (Coolify provisions the Let's Encrypt certificate) and deploy.

`nginx.conf` serves `Home.html` at `/`, redirects `/index.html` there, and
resolves extensionless links such as `/About` to `About.html`.

### Domains and search indexing

The container is indexable **only** on the production hostnames. Everything
else — the review domain `app.medxscottsdale.com`, the bare VPS IP, any Coolify
preview URL — gets `X-Robots-Tag: noindex, nofollow` plus a disallow-all
`robots.txt`, so the client-review copy cannot be indexed alongside the real
site. The allowed hosts live in the `$is_prod_host` map at the top of
`nginx.conf`:

```nginx
map $host $is_prod_host {
    default                 0;
    medxscottsdale.com      1;
    www.medxscottsdale.com  1;
}
```

When the site moves from review to production, point `medxscottsdale.com` at
the same Coolify application and the map flips it to indexable automatically —
no other change required.

## Enquiry forms

The Contact page form and the site-wide appointment modal both post to the
`send-inquiry` Supabase Edge Function, which **stores the submission and then
emails the clinic**. The row is committed before the email is attempted, so a
delivery failure is recorded rather than losing the enquiry.

Both forms report a real outcome. If the backend is unreachable or not yet
configured they show an error pointing the visitor at the phone number — they
never display a success message for a submission that did not land.

### One-time setup

**1. Create the Supabase project**, then apply the schema:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

**2. Verify `medxscottsdale.com` in Resend** and add the DKIM/SPF records it
gives you to the domain's DNS. This is independent of where the site is
hosted — you can verify the sending domain while the site is still being
reviewed on `app.medxscottsdale.com`.

**3. Set the function secrets:**

```sh
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  NOTIFY_TO=locnikar@cox.net \
  NOTIFY_FROM="Med X Scottsdale <noreply@medxscottsdale.com>" \
  ALLOWED_ORIGINS=https://app.medxscottsdale.com,https://medxscottsdale.com
```

`ALLOWED_ORIGINS` is optional; with it unset the function accepts any origin so
the form works during review.

**4. Deploy the function:**

```sh
supabase functions deploy send-inquiry
```

**5. Point the site at the project** — fill in `CONFIG` near the top of
[`js/site.js`](js/site.js):

```js
var CONFIG = window.MEDX_CONFIG || {
  supabaseUrl: 'https://<project-ref>.supabase.co',
  supabaseAnonKey: '<anon key>',
  functionName: 'send-inquiry'
};
```

The anon key is safe in page source: RLS denies it every table, and the Edge
Function is the only public surface.

### Watching for undelivered notifications

`NOTIFY_TO` is a consumer ISP mailbox, and those filter aggressively. Mail can
be delayed or silently binned regardless of authentication, so treat the table
as the source of truth rather than the inbox:

```sql
select created_at, first_name, last_name, email, phone, notify_error
from inquiries
where notified_at is null
order by created_at desc;
```

Anything listed here was captured but never confirmed as emailed. Adding a
Resend webhook for `email.bounced` / `email.complained` is the natural next
step if bounces become routine.

### Abuse handling

The endpoint is public by necessity. Two controls apply, both in the function:
a honeypot `company` field that real visitors never see, and a per-IP limit of
5 submissions per 10 minutes.
