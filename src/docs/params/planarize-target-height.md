---
id: planarize.targetHeightNm
title: Planarization target height
compareWith: Bracket the intended surface with one target above and one below nominal.
---

## Physical meaning

The target is the absolute cross-section height retained after the simplified planarization step; occupied cells above it are removed. The operation creates a perfectly flat geometric clip and does not calculate polish rate, material selectivity, dishing, erosion, or pattern-density effects.

## Failure modes

- A target that is too high leaves unwanted overburden above the intended surface.
- A target that is too low removes functional material and can resemble over-polish without modeling its real profile.

## Compare with

Bracket the intended surface with one target above and one below nominal while keeping the incoming topography fixed.
