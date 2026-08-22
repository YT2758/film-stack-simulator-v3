---
slug: borderless-via-overlay-margin
title: Borderless Via Overlay Margin: A Landed-Area Guide
description: See how via-to-metal offset reduces landed area, distinguish geometry margin from reliability, and test a borderless-via preset locally in your browser.
canonical: /case-studies/borderless-via-overlay-margin/
preset: borderless-via-margin
datePublished: 2026-08-22
dateModified: 2026-08-22
keywords: borderless via, overlay margin, landed area, via misalignment
---

## 1. Phenomenon and consequence

A bordered via is drawn with metal enclosure around its nominal footprint. That enclosure can absorb some via-to-metal displacement before any part of the via extends beyond the underlying conductor. A **borderless via** removes some or all of that geometric border to save area, so overlay and critical-dimension variation act directly on the landed footprint.

Once the via is partly unlanded, the via opening intersects both metal and surrounding dielectric. The metal intersection area decreases, and the exposed edge can alter etch, clean, barrier, fill, resistance, and reliability behavior. Those outcomes are process-specific. A geometric landed-area percentage is a useful first screen, but it is not a resistance model, an electromigration lifetime, or a yield prediction.

> **Educational scope.** This article and preset explain a deliberately simplified two-dimensional overlap model using generalized dimensions. They do not establish a design rule, allowable overlay budget, or qualified process window, and they do not replace electrical and reliability data. No claim of first-hand production results is made.

## 2. Mechanism in the simulator

The preset overlays a via footprint on an underlying metal feature and moves the via laterally. The sampled metal polygon also shapes the starting copper layer: outside the line footprint that thickness is dielectric. The authoritative 2D cut therefore shows the same partial landing that is extruded across layout Y in 3D. At every offset, the simulator counts the top-down cells shared by the via and metal, then reports:

`landed area (%) = shared via/metal cells ÷ total via-footprint cells × 100`

In a one-dimensional rectangular check, a line of width `W` and via of width `V` has full-landing margin `(W − V) / 2` on each side when both are centered and `W ≥ V`. Beyond that offset, overlap starts to fall. The grid calculation generalizes the same idea to the preset's discrete footprint and reports the actual sampled intersection.

The preset intentionally does not begin from a centered control. Its metal spans 30–62% of the layout width (center 46%), while the nominal via spans 50–70% (center 60%); the saved etch step then adds a `+20 nm` shift. On the 320 nm-wide grid, aligning those polygon centers requires an offset of about `−45 nm`. Compare the geometry in this order:

| State | Offset | Interpretation |
| --- | ---: | --- |
| Preset state | +20 nm | Deliberately shifted, partly landed case. |
| Nominal zero | 0 nm | Removes the explicit etch offset, but the drawn polygons remain off-center. |
| Geometry-centered control | About −45 nm | Aligns the polygon centers; the sampled maximum is grid-dependent. |

Grid resolution, sidewall taper, CD bias, liner thickness, corner rounding, and two-axis overlay distributions can change a real result. Treat the displayed percentage as a transparent geometry metric, not as a safe/unsafe threshold.

## 3. Open this case in the simulator

[Open the borderless-via margin case in the simulator →](/?preset=borderless-via-margin)

Open the saved `+20 nm` case, set `overlay` to zero, then sweep toward about `−45 nm` to locate the maximum landed area on the 2 nm raster. Keep the via and metal widths fixed during that comparison; after establishing the geometry-centered control, sweep in both directions to find the full-landing boundaries.

## 4. Further reading

The following primary studies connect borderless-via/contact geometry and misalignment with measured resistance or reliability behavior:

1. Y.-S. Jung et al., “Enhancing uniformity of borderless via resistance by HDP oxide technology,” *Proceedings of the 6th International Conference on VLSI and CAD*, 452–455 (1999). [https://doi.org/10.1109/ICVC.1999.820962](https://doi.org/10.1109/ICVC.1999.820962)
2. J. S. Huang, A. S. Oates, S. H. Kang, T. L. Shofner, R. A. Ashton, and Y. S. Obeng, “Comparative study on the effect of misalignment on bordered and borderless contacts,” *Journal of Electronic Materials* 30, 360–366 (2001). [https://doi.org/10.1007/s11664-001-0044-9](https://doi.org/10.1007/s11664-001-0044-9)
3. C. K. Chen, P. C. Yu, M. H. Lee, C. N. Wu, and H. Matsuo, “Borderless via clean study for minimizing Al-Cu loss in 58 nm flash devices,” *Solid State Phenomena* 145–146, 357–360 (2009). [https://doi.org/10.4028/www.scientific.net/SSP.145-146.357](https://doi.org/10.4028/www.scientific.net/SSP.145-146.357)
