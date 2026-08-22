# v3 acceptance map

This file maps the specification's interlocks to reproducible evidence in this repository. Deployment-account items remain external until a Cloudflare project, domain, and newsletter provider are supplied.

| Milestone | Repository evidence | Automated interlock |
| --- | --- | --- |
| M0 | Vite static output, self-hosted font, `_headers`, no Functions/backend | `npm run audit:egress`, `npm run test:egress`, CI |
| M1 | Sticky trust banner and generated `/trust/` page | content verifier compares runtime dependencies |
| M2 | `src/docs/params/*.md` and inline expandable panels | content verifier checks required fields and IDs |
| M3 | Three JSON presets and typed query registry | preset golden tests and browser smoke |
| M4 | IndexedDB autosave, resume prompt, named local stacks, JSON codec, fragment sharing | codec tests and browser reload/import/export smoke |
| M5 | worker-generated voxel surfaces, exact full-resolution cut cap, orbit controls, material toggles, PNG | volume and surface tests plus browser smoke |
| M6 | build-time Markdown HTML, metadata, sitemap, ARDE article | content verifier and production build |
| M7 | remaining two articles and fragment codec; provider-gated subscription form | content and codec tests |

## External completion gates

These cannot be completed from source code alone:

1. Connect the Git repository to Cloudflare Pages and select a custom domain.
2. Disable all Cloudflare browser-code injection features on that zone.
3. Run `npm run build` for the deployed commit, then run the identical runtime smoke against the deployed production origin; this skips the local preview and compares every requested static path with that local `dist/` artifact:

   ```bash
   EGRESS_TEST_ORIGIN="https://film-stack.example.com" npm run test:egress
   ```

   Replace the example origin with the real custom domain. Acceptance requires no browser network API attempts (including same-origin APIs or beacons), no non-read or non-static dynamic requests, and no cross-origin requests; only smoke-test-driven document navigations and same-origin read-only static assets are allowed.
4. Run mobile and desktop Lighthouse against production and confirm performance above 90.
5. Select and configure the article-only email subscription endpoint.
6. Provide the author name and public author contact metadata.
7. Supply authentic v2 exported fixtures before claiming v2 backward compatibility.
