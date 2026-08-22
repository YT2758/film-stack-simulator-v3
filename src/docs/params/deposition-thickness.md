---
id: deposition.thicknessNm
title: Deposition thickness
compareWith: Compare half, nominal, and double thickness at the same grid resolution.
---

## Physical meaning

This is the nominal geometric amount added by a deposition step in nanometres. The chosen mode redistributes that amount around exposed surfaces, and the grid rounds the result to cells; it is not a deposition time or calibrated growth-per-cycle value.

## Failure modes

- Too little material can leave incomplete bottom or sidewall coverage in the geometric model.
- Too much material can constrict an opening, create an overhang, or close a gap before the intended fill sequence completes.

## Compare with

Compare half, nominal, and double thickness with material, mode, and grid resolution held fixed.
