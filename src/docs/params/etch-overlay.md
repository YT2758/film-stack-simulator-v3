---
id: etch.overlayNm
title: Mask overlay offset
relatedArticle: borderless-via-overlay-margin
compareWith: Sweep equal positive and negative offsets around zero.
---

## Physical meaning

Overlay applies a lateral displacement in nanometres between the sampled mask and the underlying structure. The sign follows the simulator's X-axis convention; it is a deterministic offset, not a statistical overlay distribution or a full two-dimensional distortion map.

## Failure modes

- Via or contact offset can reduce landed area and expose surrounding dielectric.
- A line or cut-mask offset can create asymmetric edge distance even when the nominal critical dimensions are unchanged.

## Compare with

Sweep equal positive and negative offsets around zero while keeping via, line, and mask dimensions fixed.
