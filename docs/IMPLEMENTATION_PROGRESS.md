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
- Playwright reliability: 10 tests passed, covering step-ID synchronization, numeric commit behavior, WebGL unavailable, context loss and retry, non-empty PNG export, IndexedDB failure, multi-tab write conflict and recovery, Traditional Chinese core operation, desktop/phone operation, comparison, selection, metric definitions, and exact top-down via measurement.
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
- Expand SADP teaching stages only where actual engine snapshots exist; label any additional illustration as educational rather than simulated.

## Follow-up reliability and localization — completed 2026-09-08

- Autosave now has one explicit state model: checking, pending, saving, saved, conflict-paused, and storage-error. Footer status, the named-stack empty state, notices, and persistent recovery guidance all derive from that state.
- Root cause fixed: `changeFlow` previously re-armed autosave after a revision conflict. Conflict and storage-error states now remain stopped while the user keeps editing, so unsaved memory state is never relabelled as saved or pending.
- A second race was closed: edits made while an IndexedDB write is in flight remain in the saving state, then queue a new save after the completed write rather than being incorrectly marked saved.
- Conflict recovery keeps both choices explicit. “Export current work” serializes the current tab's in-memory `FlowDocument`; “Load newer draft” warns before replacement and then loads the latest revision. Saving a named copy never overwrites the last-session draft and does not silently resume autosave.
- Traditional Chinese now covers the core simulator controls, parameter labels and parameter help, validation and grid-quantization messages, comparison/selection/metric explanations, layout controls, autosave and multi-tab recovery, JSON actions, 3D state/errors/recovery, and accessible names. User-entered and document-stored names are not translated.
- Secondary text contrast was raised. At 390 px, the 3D failure message and recovery buttons remain inside the visible viewer instead of being pushed below its internal scroll area.
- English mode remains the default and all existing English regression expectations continue to pass.

### Visual evidence

- `docs/screenshots/autosave-conflict-zh-TW.png` — persistent multi-tab conflict state, consistent Stacks copy, and recovery actions.
- `docs/screenshots/before-after-comparison.png` — previous/current snapshots, difference overlay, material selection, and metric explanation.
- `docs/screenshots/traditional-chinese-core.png` — desktop Traditional Chinese core workspace and WebGL failure recovery.
- `docs/screenshots/traditional-chinese-phone.png` — 390 px Traditional Chinese layout with visible 3D recovery controls.

### Latest regression result

- Vitest: 7 files, 33 tests passed.
- Playwright: 10 tests passed.
- Content verification: 3 case studies and 18 parameter documents passed.
- Release build with `PUBLIC_SITE_URL=https://film-stack-simulator-v3.pages.dev`: passed; 24-file zero-egress artifact audit passed.
- Local production runtime zero-egress replay: passed, including presets, draft restoration, JSON/PNG round trips, named-stack operations, and 3D.
- Physical phone touch and the full browser/GPU matrix remain unverified; the 390 px test uses desktop Chrome pointer automation and WebGL failure injection.

The simulator is ready for the planned three-feature illustrated introduction from a reliability and core-language standpoint. The preset workspace entry, numeric layout editor, and expanded SADP teaching sequence remain separate Stage 3 product work and are not claimed complete here.
