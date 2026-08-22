---
slug: arde-deep-etch-slower
title: Why Deep Openings Etch Slower: An ARDE Geometry Guide
description: See how aspect ratio can slow feature-scale plasma etching, compare transport-limited openings, and launch an educational ARDE preset in your browser.
canonical: /case-studies/arde-deep-etch-slower/
preset: arde-demo
datePublished: 2026-08-22
dateModified: 2026-08-22
keywords: aspect-ratio-dependent etching, ARDE, RIE lag, plasma etch
---

## 1. Phenomenon and consequence

Two openings can start at the same top surface and receive the same nominal etch step, yet the deeper or narrower opening may advance less. The useful geometric variable is aspect ratio: etch depth divided by opening width. When the feature-scale removal rate changes with that ratio, the result is called **aspect-ratio-dependent etching (ARDE)**. A slower high-aspect-ratio feature is often described as normal RIE lag.

The practical consequence is a coupled clear-versus-overetch problem. A step long enough to clear a narrow opening may expose a stop layer beneath a wider opening for longer. If the step is shortened to protect that stop layer, the narrow opening may remain partially closed. Real plasma processes can combine neutral transport, ion transport, charging, inhibitor deposition, surface reaction, and product removal; aspect ratio alone does not identify which contribution dominates.

> **Educational scope.** This article and preset explain a deliberately simplified geometry model using generalized dimensions. They do not reproduce a qualified process, predict electrical performance, or replace wafer data, metrology, or commercial process simulation. No claim of first-hand production results is made.

## 2. Mechanism in the simulator

The preset places openings of different widths in the same cross-section. For its etch step, the simulator forms a nominal aspect ratio from requested etch depth divided by each opening width. The narrower opening therefore receives the larger ratio. With the dimensionless ARDE factor enabled, its target-removal budget is divided by `1 + ARDE factor × nominal aspect ratio`, so the narrow feature lags the wide one.

Read the result as a controlled geometry comparison, not as a plasma model:

| View | What to compare | What it means in this model |
| --- | --- | --- |
| Before-etch snapshot | Opening width at the same starting height | The only intended difference is access geometry. |
| ARDE-on result | Bottom position in wide and narrow openings | The nominal aspect-ratio rule assigns different removal budgets. |
| ARDE-off control | Remaining target thickness in both openings | A zero factor removes this illustrative source of lag; this preset still does not reach the underlying layer. |

Set the ARDE factor to zero and replay to form the control. Both features then use the same geometric depth rule. Increasing the factor strengthens the illustrative lag; it does **not** select a gas chemistry or calculate an etch rate.

## 3. Open this case in the simulator

[Open the ARDE comparison in the simulator →](/?preset=arde-demo)

The simulator runs locally in the browser. Replay the flow, then compare the preset against `ARDE factor = 0` while leaving the layout and nominal etch depth unchanged.

## 4. Further reading

The following primary papers establish transport-based interpretations of high-aspect-ratio etching and compare ARDE models with experiment:

1. J. W. Coburn and H. F. Winters, “Conductance considerations in the reactive ion etching of high aspect ratio features,” *Applied Physics Letters* 55, 2730–2732 (1989). [https://doi.org/10.1063/1.101937](https://doi.org/10.1063/1.101937)
2. R. J. Xie, J. D. Kava, and M. Siegel, “Aspect ratio dependent etching on metal etch: Modeling and experiment,” *Journal of Vacuum Science & Technology A* 14, 1067–1071 (1996). [https://doi.org/10.1116/1.580135](https://doi.org/10.1116/1.580135)
