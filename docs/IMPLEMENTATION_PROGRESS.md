# Film Stack Simulator v3 implementation progress

Last updated: 2026-09-08

This file records verified implementation state. It does not describe unfinished work as complete.

## Stage 1 — reliability and state consistency

### Completed and verified

- 3D readiness now distinguishes renderer creation, local geometry completion, and first-frame presentation.
- WebGL creation failure, render failure, and `webglcontextlost` produce explicit error states. Users can return to 2D without changing the flow or retry 3D from the current document.
- PNG export is disabled until a first frame has been presented. The browser test checks the downloaded PNG signature and non-trivial byte size.
- Editing and preview state use stable process-step IDs. A newly added step is both opened and previewed; a visible action previews any other edited step.
- Reordering, disabling, and deleting a previewed step keep the timeline, caption, simulation snapshot, and metrics on the same resolved process state.
- Initial local-draft lookup has a dedicated blocking state. Share fragments take precedence over presets; presets take precedence over browser drafts; a blank flow is used only when none is supplied.
- Autosave reports pending, saving, saved, and stopped states based on the actual IndexedDB transaction.
- Last-session storage uses an optimistic revision envelope. A stale tab stops autosaving instead of overwriting a newer revision.
- Existing unwrapped v3 IndexedDB drafts remain readable and migrate on their next intentional save. Exported JSON and share fragments remain schema v3 and unchanged.
- Numeric editors allow an empty/intermediate typing state. Validation, clamping, and step alignment occur on commit with an inline reason. Nanometre controls disclose the authoritative grid-cell resolution and quantization.
- Desktop and 390 px phone-width 2D layouts were rendered and visually inspected. The core controls, cross-section, timeline, and metrics remain reachable without horizontal page overflow.

### Stage 1 automated checks

```bash
npm test
npm run typecheck
npm run test:content
npm run test:reliability
npm run test:egress
```

Latest combined verification on 2026-09-08:

- Vitest: 7 files, 33 tests passed.
- Playwright reliability: 9 tests passed, covering step-ID synchronization, numeric commit behavior, WebGL unavailable, context loss and retry, non-empty PNG export, IndexedDB failure, multi-tab write conflict, desktop/phone 2D operation, comparison, selection, metric definitions, and exact top-down via measurement.
- Static artifact zero-egress audit passed for 24 files.
- Runtime zero-egress flow passed, including presets, replay, JSON import/export, share/draft restoration, named stacks, 3D, and PNG.

### Not fully verified in Stage 1

- Physical mobile-device touch behavior was not tested; the phone-width browser test uses pointer automation.
- 3D was verified in local desktop Chrome with software/hardware support selected by the browser, not across the full GPU/browser matrix.
- Renderer recovery after an operating-system or driver-level GPU reset still needs manual cross-browser testing; automated coverage dispatches the same standard `webglcontextlost` event and rebuild path.
- The physical-model accuracy of ARDE, selectivity, deposition, CMP, and SADP is outside Stage 1 and remains unclaimed.

## Stage 2 — understanding process changes

### Completed and verified

- Added a Before / after view using adjacent snapshots from the existing engine. Both panels share the same grid, physical scale, Y cut, and material palette.
- The current panel overlays added, removed, and material-replaced cells; narrow screens stack the panels vertically without changing scale.
- Added authoritative 2D material picking. The selected connected material region receives a neutral outline while retaining its fixed palette color.
- Material details separate local remaining thickness measured from contiguous engine cells, matching starting-stack nominal thickness, and matching nominal deposition commands.
- Schema v3 does not retain cell provenance, so repeated same-material sources are explicitly reported as unattributable rather than inferred.
- Added expandable definitions for Etched depth, Mask-open columns, Enclosed voids, and Via landed area, including units, spatial scope, aggregation, and zero versus not-applicable behavior.
- Measurement overlays are derived from metadata stored with the same snapshot metrics: exact maximum-etch cells, mask-open columns, and enclosed-void bounding regions. Via landed area reports the exact top-down landed/nominal raster counts because it is not a cross-section measurement.
- Reproduced the default 90 nm commanded low-k etch result of 6 nm in an engine regression. At the 72 nm opening, ARDE reduces the target-equivalent budget; selectivity 8 charges each non-target photoresist cell eight units, so only three 2 nm photoresist cells are removed before the next cell exceeds the remaining budget. The target low-k is not reached.

### Stage 2 automated checks

- Added two unit tests for cell inspection and connected-region highlighting.
- Added the 90 nm command / 6 nm measured-depth regression and its exact measurement-cell assertion.
- Added browser coverage for Before / after content, non-zero removal differences, material inspection disclosure, metric definitions, and 390 px stacked comparison layout.

### Not fully verified in Stage 2

- Material-source attribution cannot be added reliably without a future provenance-aware engine data model and schema migration.
- Via landed-area highlighting is intentionally shown in the Layout editor rather than the cross-section because the metric is a whole top-down raster measurement; landed and unlanded shifted-via cells come from the same raster result as its exact numerator and denominator.
- Physical accuracy remains unclaimed; the new UI documents the deterministic geometry definitions rather than validating them against fab or TCAD data.

## Next concrete work — Stage 3

- Move preset entry points into the workspace with current-work protection.
- Add validated numeric layout geometry controls with drag synchronization.
- Complete Traditional Chinese coverage and improve small secondary text readability.
- Expand SADP teaching stages only where actual engine snapshots exist; label any additional illustration as educational rather than simulated.
