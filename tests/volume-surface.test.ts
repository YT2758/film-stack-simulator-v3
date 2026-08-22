import { describe, expect, it } from 'vitest'
import {
  buildVoxelSurface,
  surfaceMaterialCounts,
} from '../src/three/voxel-surface'
import type { VolumeGrid } from '../src/three/volume'

function makeVolume(
  width: number,
  height: number,
  depth: number,
  cells: Uint8Array,
): VolumeGrid {
  return {
    width,
    height,
    depth,
    depthSlices: depth,
    cellSizeNm: 2,
    cells,
    slicePositions: Array.from({ length: depth }, (_, index) => index / Math.max(1, depth - 1)),
    cutPosition: 1,
    cutSliceIndex: depth - 1,
    throughStep: -1,
    stepIndex: -1,
    stepName: 'Base stack',
  }
}

describe('exposed voxel geometry', () => {
  it('reports exact source, cap, and exposed instance counts by material', () => {
    const cells = new Uint8Array(3 * 3 * 3).fill(1)
    // A different buried material creates an interface that remains revealable.
    cells[1 * 9 + 1 * 3 + 1] = 2
    const geometry = buildVoxelSurface(makeVolume(3, 3, 3, cells), {
      timeBudgetMs: Number.POSITIVE_INFINITY,
    })
    const counts = surfaceMaterialCounts(geometry)

    expect(geometry.downsampled).toBe(false)
    expect(counts.get(1)).toEqual({ instances: 26, sourceVoxels: 26, capVoxels: 9 })
    expect(counts.get(2)).toEqual({ instances: 1, sourceVoxels: 1, capVoxels: 0 })
    expect(geometry.materials.find((material) => material.materialCode === 1)?.matrices.length)
      .toBe(26 * 16)
  })

  it('retries bulk geometry at lower resolution while retaining a full-resolution cap', () => {
    const volume = makeVolume(16, 16, 10, new Uint8Array(16 * 16 * 10).fill(1))
    let clock = 0
    const geometry = buildVoxelSurface(volume, {
      timeBudgetMs: 0,
      now: () => ++clock,
    })
    const material = geometry.materials.find((candidate) => candidate.materialCode === 1)

    expect(geometry.downsampled).toBe(true)
    expect(geometry.stride).toBeGreaterThan(1)
    expect(material?.capVoxelCount).toBe(16 * 16)
    expect(material?.sourceVoxelCount).toBe(16 * 16 * 10)
    expect(material?.instanceCount).toBeGreaterThanOrEqual(16 * 16)
  })
})
