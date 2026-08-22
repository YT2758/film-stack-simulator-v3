---
id: sadp.mandrelPitchNm
title: SADP mandrel pitch
relatedArticle: sadp-pitch-walking
compareWith: Change pitch while keeping mandrel width and spacer thickness fixed.
---

## Physical meaning

Mandrel pitch is the center-to-center repeat distance of the sacrificial template before spacers are formed. Changing it regenerates the periodic top-down mandrel polygons; the 2D engine then samples their actual edges at the selected cut. Ideal sidewall spacers create a denser line array from that template, but equal final spacing also depends on mandrel width and spacer thickness.

## Failure modes

- A pitch that is too small for the selected widths can close the space between neighboring spacers.
- Changing pitch without retargeting mandrel width can separate the final gaps into unequal populations.

## Compare with

Change pitch while keeping mandrel width and spacer thickness fixed, then retarget width to recover the symmetric control.
