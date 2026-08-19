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
