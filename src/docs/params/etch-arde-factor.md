---
id: etch.ardeFactor
title: ARDE factor
relatedArticle: arde-deep-etch-slower
compareWith: Use zero as the control, then increase the factor without changing opening geometry.
---

## Physical meaning

This dimensionless geometric loading term reduces removal using requested etch depth divided by sampled opening width; zero disables the rule. It is intentionally a compact teaching control and does not evolve the aspect ratio during a step or resolve neutral transport, ion angular distributions, charging, passivation, or product evacuation separately.

## Failure modes

- A large factor can leave deep or narrow features uncleared while wider features reach the requested depth.
- Fitting this factor to one structure and treating it as a transferable recipe parameter can create false predictive confidence.

## Compare with

Use `0` as the control, then increase the factor while leaving opening width, nominal depth, and selectivity unchanged.
