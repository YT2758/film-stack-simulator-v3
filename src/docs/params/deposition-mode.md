---
id: deposition.mode
title: Deposition mode
relatedArticle: arde-deep-etch-slower
compareWith: Replay the same thickness in conformal, directional, and gap-fill modes.
---

## Physical meaning

The mode selects a geometric coverage rule: conformal expands exposed surfaces, directional favors surfaces facing the source direction, and gap-fill preferentially occupies accessible void space. These are teaching abstractions for profile evolution, not CVD, PVD, ALD, or reflow reaction models.

## Failure modes

- Directional coverage can leave sidewalls or bottoms discontinuous and can form an overhang near an opening.
- Conformal or gap-fill coverage can narrow or close an opening; the simplified gap-fill rule may look more ideal than a real fill process.

## Compare with

Replay the same material and nominal thickness in conformal, directional, and gap-fill modes to separate coverage rule from dose.
