import { describe, expect, it } from 'vitest'
import { createBlankFlow } from '../src/domain/defaults'
import { MATERIAL_CODE } from '../src/domain/materials'
import { simulateAtCut } from '../src/engine/simulate'
import { getPresetById } from '../src/presets'
import {
  cutCap,
  sampleVolume,
  volumeSlice,
} from '../src/three/volume'

describe('authoritative 2D volume sampling', () => {
  it('uses the 2D engine result verbatim for every depth slice', () => {
    const document = createBlankFlow()
    document.grid.depthSlices = 7
    document.layout.cutPosition = 0.37
    document.steps = [{
      id: 'layout-etch',
      name: 'Layout-sensitive etch',
      type: 'etch',
      enabled: true,
      target: 'photoresist',
      depthNm: 12,
      selectivity: 20,
      ardeFactor: 0,
      mask: 'layout',
      overlayNm: 0,
    }]
    const before = JSON.stringify(document)

    const volume = sampleVolume(document)

    expect(volume.depth).toBe(7)
    expect(volume.slicePositions[volume.cutSliceIndex]).toBe(0.37)
    for (let z = 0; z < volume.depth; z += 1) {
      const expected = simulateAtCut(document, volume.slicePositions[z])
      expect(volumeSlice(volume, z)).toEqual(expected.cells)
    }
    const uniqueSlices = new Set(
      volume.slicePositions.map((_, z) => Array.from(volumeSlice(volume, z)).join(',')),
    )
    expect(uniqueSlices.size).toBeGreaterThan(1)
    expect(JSON.stringify(document)).toBe(before)
  })

  it('keeps the selected cut cap byte-for-byte equal to the same 2D cut', () => {
    const document = createBlankFlow()
    document.grid.depthSlices = 6
    const cutPosition = 0.61

    const volume = sampleVolume(document, { cutPosition, throughStep: -1 })
    const expectedCap = simulateAtCut(document, cutPosition, -1)

    expect(volume.cutPosition).toBe(cutPosition)
    expect(cutCap(volume)).toEqual(expectedCap.cells)
    expect(volume.stepIndex).toBe(-1)
  })

  it('extrudes layout-bounded SADP lines only through mandrel-covered depth slices', () => {
    const document = structuredClone(getPresetById('sadp-pitch-walking')!.document)
    document.grid.depthSlices = 11
    const volume = sampleVolume(document)
    const outside = volumeSlice(volume, 0)
    const middle = volumeSlice(volume, 5)

    expect(outside).not.toContain(MATERIAL_CODE.spacer)
    expect(middle).toContain(MATERIAL_CODE.spacer)
  })
})
