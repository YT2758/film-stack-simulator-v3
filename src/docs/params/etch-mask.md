---
id: etch.mask
title: Etch mask source
compareWith: Replay once with layout masking and once as a blanket etch.
---

## Physical meaning

`Layout` restricts removal to openings sampled from the top-down pattern, while `blanket` allows removal across all exposed positions. This switch selects a geometric mask source; it does not simulate photoresist imaging, focus-exposure, or mask erosion by itself.

## Failure modes

- A blanket setting can remove material outside the intended patterned opening.
- A layout setting with the wrong cut position or feature visibility can protect the entire cross-section or expose the wrong region.

## Compare with

Replay the same target and depth once with layout masking and once as a blanket etch.
