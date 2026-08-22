---
id: sadp.pitchWalkNm
title: SADP pitch-walk displacement
relatedArticle: sadp-pitch-walking
compareWith: Use zero as the symmetric control, then compare equal positive and negative values.
---

## Physical meaning

This value directly applies an alternating edge displacement in nanometres to demonstrate pitch walking. It is an observable geometry input, not a calculated consequence of a specific mandrel, deposition, or etch mechanism.

## Failure modes

- Nonzero displacement creates alternating gaps and consumes downstream edge-placement margin.
- A displacement near the available half-space can make lines overlap or erase a gap, outside the range of a useful perturbation study.

## Compare with

Use `0` as the symmetric control, then compare equal positive and negative values with every other SADP dimension fixed.
