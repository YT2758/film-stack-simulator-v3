# Film Stack Simulator v3

A browser-only semiconductor process geometry simulator for explaining film stacks, deposition profiles, directional etch, ARDE, SADP pitch walking, and borderless-via landing.

The simulator is deliberately a deterministic geometry tool, not a plasma-chemistry, reaction-kinetics, Monte Carlo, or sign-off model. Its primary design constraint is verifiable privacy: the simulator has no backend and makes no cross-origin requests.

## Run locally

Requirements: Node.js 24 and npm 11 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run test:content
npm run build
npm run test:egress
```

`npm run build` also runs the static zero-egress artifact audit. By default, the runtime egress check launches a local production preview, replays all presets, imports and exports a flow, restores IndexedDB state after reload, and opens 3D. It permits only smoke-test-driven document navigations and same-origin read-only static assets whose exact paths exist in the local `dist/` artifact; it fails on every browser network API attempt (including same-origin `fetch`, XHR, WebSocket, EventSource, or beacon), non-read request, non-static dynamic request, injected asset, or cross-origin request. API attempts are retained across the smoke test's reloads. Run `npm run build` first so the comparison artifact is current.

## Privacy model

- Simulation and 3D geometry generation run locally. 3D generation is isolated in a Web Worker.
- Named stacks and the current draft use IndexedDB in the current browser.
- JSON import/export uses local browser file APIs.
- Share links use a compressed URL fragment (`#state=...`). Browsers do not send fragments in HTTP requests, but the full state is visible anywhere the user pastes the link.
- The simulator CSP sets `connect-src 'none'` and `form-action 'none'`.
- There is no authentication, cloud database, telemetry, advertising, analytics beacon, error-reporting service, or CDN asset.

The generated `/trust/` page lists the actual direct runtime dependencies from `package.json` and explains how to verify the claim with DevTools.

## Cloudflare Pages

Use Git integration with these build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Root directory | repository root |

Set the Pages build variable `PUBLIC_SITE_URL` to the final HTTPS custom-domain origin. Cloudflare builds and `npm run cf:deploy` fail closed when it is absent or still points to `example.com`, preventing placeholder canonical URLs from being published.

No Pages Functions, bindings, database, or Wrangler configuration are required. Cloudflare Pages serves this as static output. The static case studies are emitted as real `/case-studies/<slug>/index.html` files; unmatched simulator routes can use Pages' built-in SPA fallback.

Before accepting the zero-egress interlock on a deployed custom domain, disable platform features that inject browser code:

- Cloudflare Web Analytics
- Zaraz
- Speed Brain and Prefetch URLs
- Bot Management JavaScript Detections / Bot Fight Mode injection
- Rocket Loader
- Email Address Obfuscation
- Cloudflare Fonts

After building the same commit that was deployed, run the identical Playwright smoke directly against the deployed production origin (replace the example origin with the real custom domain):

```bash
EGRESS_TEST_ORIGIN="https://film-stack.example.com" npm run test:egress
```

When `EGRESS_TEST_ORIGIN` is set, the command does not start a local preview. Local artifact checks cannot detect scripts injected later by a zone setting. See Cloudflare's official [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), and [custom headers](https://developers.cloudflare.com/pages/configuration/headers/) documentation.

The optional `npm run cf:dev` and `npm run cf:deploy` commands are for local Pages emulation or an intentional manual upload. Git-connected deployment remains the expected production workflow.

## Static content and newsletter configuration

Case studies live in `content/case-studies/*.md`. `scripts/build-content.mjs` produces indexable HTML, the trust page, content CSS, and `sitemap.xml` before Vite copies `public/` into `dist/`.

An email provider has not been selected. By default, article pages display an honest “subscription unavailable” note and make no external request. After the owner selects a provider, set `NEWSLETTER_FORM_ACTION` to its HTTPS form endpoint at build time. Only article pages may submit to that exact origin; the simulator must retain `connect-src 'none'` and must never load provider JavaScript.

Other optional build metadata is documented in [.env.example](./.env.example).

## Architecture

- `src/domain/` — the single serializable `FlowDocument` contract and material palette.
- `src/engine/` — pure `Uint8Array` grid operations and authoritative 2D simulation.
- `src/presets/` — the three static v3 flow documents and typed registry.
- `src/persistence/` — validation, JSON codec, IndexedDB repository, and compressed fragment codec.
- `src/three/` — volume sampling, exact cut cap, worker protocol, and display-only voxel geometry.
- `src/docs/params/` — one Markdown explanation per editable process parameter.
- `content/case-studies/` — English SEO source articles.
- `tests/` — deterministic engine, preset, codec, and 2D/3D consistency interlocks.

The 3D module is a pure consumer. It samples the same 2D engine at several layout Y positions and keeps the selected cut cap at full resolution even if display geometry is downsampled. It never feeds results back into the simulation.

## Compatibility boundary

The supplied workspace did not contain the v2 `Uint8Array` engine, its exported JSON fixture, or its SADP/via golden snapshots. A nearby older project was a v1-style layer-stack prototype backed by Supabase, so it was not copied. This repository establishes a versioned v3 schema and new deterministic goldens; it does **not** claim byte-compatible v2 import or that unavailable v2 fixtures passed.

If authentic v2 fixtures become available, add an explicit migration in `src/persistence/` and run both old and new goldens before advertising backward compatibility.
