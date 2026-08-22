---
slug: sadp-pitch-walking
title: SADP Pitch Walking: Where Alternating Spacing Begins
description: Trace SADP pitch walking from mandrel and spacer asymmetry to alternating space populations, then inspect the geometry in a browser-only preset.
canonical: /case-studies/sadp-pitch-walking/
preset: sadp-pitch-walking
datePublished: 2026-08-22
dateModified: 2026-08-22
keywords: SADP pitch walking, spacer double patterning, mandrel CD, edge placement error
---

## 1. Phenomenon and consequence

Self-aligned double patterning (SADP) uses sidewall spacers around a lower-density mandrel pattern to create twice as many lines. In the ideal one-dimensional construction, spacer thickness and mandrel geometry are symmetric, and the resulting line centers are evenly spaced. **Pitch walking** appears when successive gaps alternate between two populations instead of repeating at one pitch.

The cadence matters even when the average pitch looks correct. A downstream cut or transfer step sees local edges, not just the array average, so an alternating displacement consumes edge-placement margin in opposite directions on adjacent features. Mandrel critical dimension, mandrel placement and profile, spacer deposition, and spacer etch can all contribute; pitch walking should not be assigned to lithographic overlay alone.

> **Educational scope.** This article and preset explain a deliberately simplified geometry model using generalized dimensions. They do not reproduce a qualified process, predict yield, or replace CD/overlay metrology and process-window experiments. No claim of first-hand production results is made.

## 2. Mechanism in the simulator

The top-down mandrel polygons are authoritative geometry. At the selected cut Y, the 2D engine finds each sampled mandrel edge, places a spacer line beside it using the selected spacer thickness, and moves each left/right pair outward by the explicit `pitch walk` value. Outside the polygons' Y extent there is no spacer, so the worker-generated 3D view terminates the lines at the same layout boundary. Changing numeric mandrel pitch or width regenerates the preset's periodic polygons; manually dragged vertices remain authoritative until one of those two controls is changed again. Pitch walk is still a user-chosen geometry perturbation, not a result derived from deposition or etch chemistry.

For an idealized mandrel pitch `P`, mandrel width `M`, and spacer thickness `S`, the two spaces are governed by different parts of the construction: one inherits the former mandrel region, while the next inherits the region between adjacent mandrels after both spacers are present. A change in `M` moves those two space populations in opposite directions. A change or asymmetry in `S` changes spacer-line width and the adjacent spaces. The preset makes this alternating signature visible without claiming a unique physical root cause.

Use three comparisons:

| Comparison | Hold fixed | Inspect |
| --- | --- | --- |
| `pitch walk = 0` vs preset value | Pitch, mandrel width, spacer dimensions | Whether line-center spacing changes from one population to two. |
| Mandrel width − small / nominal / large | Pitch and spacer dimensions | Opposite movement of the two gap populations. |
| Spacer thickness − small / nominal / large | Mandrel geometry | Coupled change in spacer CD and free-space width. |

## 3. Open this case in the simulator

[Open the SADP pitch-walking case in the simulator →](/?preset=sadp-pitch-walking)

Compare the saved spacer result with `pitch walk = 0` for the symmetric control. Then change one geometry input at a time. Dragging a mandrel vertex changes the sampled edge directly; changing numeric pitch or width rebuilds a periodic rectangular mandrel array while preserving its current Y extent.

## 4. Further reading

These primary conference papers demonstrate spacer-defined patterning and quantify how sacrificial-pattern and unit-process variation produce multiple spacing populations:

1. C. Bencher, Y. Chen, H. Dai, W. Montgomery, and L. Huli, “22 nm half-pitch patterning by CVD spacer self alignment double patterning (SADP),” *Proceedings of SPIE* 6924, 69244E (2008). [https://doi.org/10.1117/12.772953](https://doi.org/10.1117/12.772953)
2. W. H. Arnold, “Towards 3nm overlay and critical dimension uniformity: an integrated error budget for double patterning lithography,” *Proceedings of SPIE* 6924, 692404 (2008). [https://doi.org/10.1117/12.782311](https://doi.org/10.1117/12.782311)
3. M. J. Maslow et al., “Co-optimization of exposure dose and etch process for SAQP pitch walk control,” *Proceedings of SPIE* 10587, 1058704 (2018). [https://doi.org/10.1117/12.2297345](https://doi.org/10.1117/12.2297345)
