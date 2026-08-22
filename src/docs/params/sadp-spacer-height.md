---
id: sadp.spacerHeightNm
title: SADP spacer height
relatedArticle: sadp-pitch-walking
compareWith: Change height without changing lateral spacer thickness.
---

## Physical meaning

Spacer height sets the vertical extent of the sidewall mask in the cross-section. It is independent from lateral thickness in this geometry model; the simulator does not calculate taper, mechanical stability, or height loss from an etch budget.

## Failure modes

- A short spacer can provide insufficient geometric mask height for a later transfer step.
- A very tall, narrow spacer may look stable in the model even though collapse or profile deformation would require separate physics.

## Compare with

Change height while keeping lateral spacer thickness and downstream transfer depth fixed.
