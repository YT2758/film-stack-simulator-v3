---
id: deposition.sidewallFactor
title: Directional sidewall factor
compareWith: In directional mode, compare a low factor with 1.0 while keeping thickness fixed.
---

## Physical meaning

In directional mode, this dimensionless factor scales the nominal deposition applied to vertical sidewalls relative to source-facing horizontal surfaces. A lower value represents poorer sidewall coverage; it is a geometry control, not a fitted angular flux distribution.

## Failure modes

- A low factor can leave a discontinuous sidewall or barrier path even when the top surface looks thick.
- A high factor can make a nominally directional process look conformal and can overstate coverage deep inside an opening.

## Compare with

In directional mode, compare a low factor with `1.0` while keeping nominal thickness and layout fixed; then compare the result with conformal mode.
