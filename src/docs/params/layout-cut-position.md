---
id: layout.cutPosition
title: Cross-section cut position
compareWith: Move the cut through the center and edge of the same top-down feature.
---

## Physical meaning

The cut position is the normalized top-down Y coordinate sampled to produce the authoritative 2D cross-section. Moving it changes which layout polygons intersect the section; it does not move the polygons themselves or represent wafer-level process variation.

## Failure modes

- A cut outside the feature can make a patterned step appear blanket or empty even though the top-down layout is valid.
- A cut through an edge can exaggerate small overlay or rasterization changes and give an unrepresentative section.

## Compare with

Move the cut through the center and then the edge of the same feature while holding the process flow fixed.
