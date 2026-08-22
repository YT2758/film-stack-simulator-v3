---
id: etch.depthNm
title: Nominal etch depth
relatedArticle: arde-deep-etch-slower
compareWith: Bracket the clear point with a shallower and deeper value while holding selectivity fixed.
---

## Physical meaning

This value is the requested nominal vertical removal in nanometres before geometric loading and selectivity modify the result. It is a distance control, not etch time multiplied by a measured rate, and the final depth is quantized by the grid.

## Failure modes

- Insufficient depth leaves target residue or an unopened feature.
- Excess depth increases mask or stop-layer exposure and can erase geometric margin that was visible at nominal clear.

## Compare with

Bracket the clear point with a shallower and deeper value while holding target, selectivity, mask, and ARDE factor fixed.
