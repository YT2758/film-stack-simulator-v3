---
id: deposition.material
title: Deposited material
compareWith: Change only the material identity, then inspect later material-selective etch steps.
---

## Physical meaning

This field assigns a material ID and palette color to newly occupied grid cells. Material identity determines which later material-selective step can target those cells, but the simulator does not infer density, stress, chemistry, conductivity, or a deposition rate from the name.

## Failure modes

- Choosing the wrong material can make a later selective etch leave the deposited region untouched or remove the wrong region.
- Reusing one material ID for physically different films can hide an interface that matters to the intended process story.

## Compare with

Keep the geometry fixed, change only the material identity, and inspect how a later target-selective etch responds.
