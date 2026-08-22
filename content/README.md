# Static content contract

Case studies live in `content/case-studies/*.md`. Each file begins with scalar YAML-style front matter containing `slug`, `title`, `description`, `canonical`, `preset`, `datePublished`, and `dateModified`. The body keeps the four numbered level-two sections in the order enforced by `scripts/verify-content.mjs`.

`scripts/build-content.mjs` renders these sources and `content/trust.md` into same-origin, no-JavaScript pages under `public/`. It reads the process environment and an optional local `.env` file without overriding exported variables. `PUBLIC_SITE_URL` controls absolute canonical and sitemap URLs and must be set to the real deployment origin before release. `NEWSLETTER_FORM_ACTION` is opt-in and must resolve to HTTPS: an unset value produces an unavailable notice and no form element.

Generated files are build artifacts. Edit the Markdown or generator instead of editing `public/case-studies/`, `public/trust/`, `public/content.css`, or `public/sitemap.xml` by hand.
