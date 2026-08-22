---
title: How the browser-only guarantee works
description: Verify how Film Stack Simulator keeps process geometry in your browser, inspect its runtime dependencies, and audit network activity yourself.
canonical: /trust/
dateModified: 2026-08-22
---

## What “browser-only” means

Film Stack Simulator has no application back end, account service, telemetry endpoint, or cloud-save API. Cloudflare Pages serves static files. The browser performs the geometry calculations and stores saved stacks locally. Export creates a local download initiated by the user.

The guarantee applies to the simulator at `/`: after its same-origin static files load, running a flow, saving locally, and exporting must not create another network request. A manually submitted newsletter form may exist on case-study pages only when its owner has configured an action; it is never included in the simulator.

## Runtime dependencies

The list below is generated at build time from the `dependencies` object in `package.json`; it is not a hand-maintained marketing list.

{{RUNTIME_DEPENDENCIES}}

Build and test tools under `devDependencies` do not ship as browser runtime dependencies. The IBM Plex Sans font file used by these static pages is copied from the declared Fontsource package and served from this site's own origin.

## Verify it yourself in DevTools

1. Open the simulator at `/` in a private window with browser extensions disabled.
2. Open Developer Tools, choose **Network**, enable **Preserve log**, and enable **Disable cache** while DevTools is open.
3. Reload the page, then open the 3D view once so its lazily loaded JavaScript and worker are fetched. Initial HTML, JavaScript, CSS, worker, and font requests should all have the site's own origin. Inspect the document response headers too: `Speculation-Rules` must be absent.
4. Clear the Network list without reloading. Run a complete flow, change parameters, save it locally, switch between the now-loaded views, and export JSON.
5. The list should remain empty. If it does not, inspect the **Domain**, **Initiator**, and request URL. A browser extension is not site code, but any request initiated by the simulator is a failed zero-egress check.
6. Repeat against the deployed production URL because an edge platform can modify HTML after the repository build.

The repository can be inspected independently: {{REPOSITORY_LINK}}

## Cloudflare features that must stay off

Cloudflare can inject or rewrite client resources after deployment. Keep all of the following disabled for the simulator hostname, then repeat the production Network test:

- **Pages Web Analytics / Browser Insights.** Pages one-click Web Analytics automatically inserts a JavaScript beacon. [Cloudflare Pages documentation](https://developers.cloudflare.com/pages/how-to/web-analytics/)
- **Zaraz auto-injection.** Zaraz can insert `/cdn-cgi/zaraz/i.js` even when it is absent from the repository output. [Cloudflare Zaraz documentation](https://developers.cloudflare.com/zaraz/advanced/load-zaraz-manually/)
- **Speed Brain.** It is enabled by default and adds a `Speculation-Rules` response header that can make the browser prefetch a likely navigation. [Cloudflare Speed Brain documentation](https://developers.cloudflare.com/speed/optimization/content/speed-brain/)
- **Prefetch URLs.** Enterprise URL prefetching must remain off even though it requires additional configuration before it acts. [Cloudflare Prefetch URLs documentation](https://developers.cloudflare.com/speed/optimization/content/prefetch-urls/)
- **Bot Management JavaScript Detections / Bot Fight Mode injection.** JavaScript Detections inserts a script into HTML and issues a `cf_clearance` cookie; do not enable it on this hostname. [Cloudflare JavaScript Detections documentation](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/)
- **Rocket Loader.** It rewrites JavaScript loading and requires script execution outside this build's trust boundary. [Cloudflare Rocket Loader documentation](https://developers.cloudflare.com/speed/optimization/content/rocket-loader/)
- **Email Address Obfuscation.** It injects `email-decode.min.js` into HTML containing email addresses. [Cloudflare Email Address Obfuscation documentation](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/)
- **Cloudflare Fonts.** It rewrites HTML and font URLs; this project instead emits its own same-origin WOFF2 asset. [Cloudflare Fonts documentation](https://developers.cloudflare.com/speed/optimization/content/fonts/)

Ordinary Cloudflare caching and transport compression do not add browser destinations. The interlock is observable behavior: if a platform setting, dependency, or future feature causes a new request, disable it or remove the zero-egress claim before release.
