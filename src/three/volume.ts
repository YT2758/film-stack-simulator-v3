import type { FlowDocument } from '../domain/flow'
import { simulateAtCut } from '../engine/simulate'

export interface VolumeBuildOptions {
  /** Number of layout-Y positions sampled into the display-only depth axis. */
  depthSlices?: number
  /** Layout-Y position that must be represented by one exact, authoritative slice. */
  cutPosition?: number
  /** Zero-based inclusive process step. -1 samples the base stack only. */
  throughStep?: number
}

export interface VolumeGrid {
  width: number
  height: number
  depth: number
  depthSlices: number
  cellSizeNm: number
  /** Slice-major, then row-major cells: z * width * height + y * width + x. */
  cells: Uint8Array
  /** The exact normalized layout-Y position used for every depth slice. */
  slicePositions: number[]
  cutPosition: number
  cutSliceIndex: number
  throughStep: number
  stepIndex: number
  stepName: string
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function positiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.floor(value))
}

function normalizedThroughStep(document: FlowDocument, throughStep: number | undefined): number {
  const requested = throughStep ?? document.steps.length - 1
  const finiteStep = Number.isFinite(requested) ? Math.floor(requested) : document.steps.length - 1
  return Math.max(-1, Math.min(document.steps.length - 1, finiteStep))
}

export function cutPositionToSliceIndex(cutPosition: number, depthSlices: number): number {
  const depth = positiveInteger(depthSlices, 1)
  if (depth === 1) return 0
  return Math.round(clamp01(cutPosition) * (depth - 1))
}

/**
 * Sample the authoritative 2D engine at each layout-Y position.
 *
 * The selected cut position replaces its nearest regular sample. This makes the
 * cap byte-for-byte identical to `simulateAtCut(document, cutPosition)` without
 * interpolating, rescaling, or allowing the 3D consumer to change engine state.
 */
export function sampleVolume(
  document: FlowDocument,
  options: VolumeBuildOptions = {},
): VolumeGrid {
  const depth = positiveInteger(options.depthSlices ?? document.grid.depthSlices, 1)
  const requestedCut = options.cutPosition ?? document.layout.cutPosition
  const cutPosition = clamp01(
    Number.isFinite(requestedCut) ? requestedCut : document.layout.cutPosition,
  )
  const cutSliceIndex = cutPositionToSliceIndex(cutPosition, depth)
  const throughStep = normalizedThroughStep(document, options.throughStep)
  const slicePositions = Array.from(
    { length: depth },
    (_, index) => (depth === 1 ? cutPosition : index / (depth - 1)),
  )
  slicePositions[cutSliceIndex] = cutPosition

  let width = 0
  let height = 0
  let cellSizeNm = document.grid.cellSizeNm
  let stepIndex = throughStep
  let stepName = ''
  let cells: Uint8Array | undefined

  for (let z = 0; z < depth; z += 1) {
    const snapshot = simulateAtCut(document, slicePositions[z], throughStep)
    const sliceCellCount = snapshot.width * snapshot.height

    if (z === 0) {
      width = snapshot.width
      height = snapshot.height
      cellSizeNm = snapshot.cellSizeNm
      stepIndex = snapshot.stepIndex
      stepName = snapshot.stepName
      cells = new Uint8Array(sliceCellCount * depth)
    } else if (snapshot.width !== width || snapshot.height !== height) {
      throw new Error(
        `2D engine returned inconsistent slice dimensions at depth ${z}: ` +
          `${snapshot.width}x${snapshot.height}, expected ${width}x${height}`,
      )
    }

    if (snapshot.cells.length !== sliceCellCount) {
      throw new Error(
        `2D engine returned ${snapshot.cells.length} cells for a ` +
          `${snapshot.width}x${snapshot.height} slice`,
      )
    }

    cells!.set(snapshot.cells, z * sliceCellCount)
  }

  return {
    width,
    height,
    depth,
    depthSlices: depth,
    cellSizeNm,
    cells: cells!,
    slicePositions,
    cutPosition,
    cutSliceIndex,
    throughStep,
    stepIndex,
    stepName,
  }
}

/** Alias retained for call sites that describe this as a build operation. */
export const buildVolume = sampleVolume

export function volumeSlice(volume: VolumeGrid, sliceIndex: number): Uint8Array {
  if (!Number.isInteger(sliceIndex) || sliceIndex < 0 || sliceIndex >= volume.depth) {
    throw new RangeError(`Volume slice ${sliceIndex} is outside 0..${volume.depth - 1}`)
  }
  const sliceCellCount = volume.width * volume.height
  const start = sliceIndex * sliceCellCount
  return volume.cells.slice(start, start + sliceCellCount)
}

export function cutCap(volume: VolumeGrid): Uint8Array {
  return volumeSlice(volume, volume.cutSliceIndex)
}

export function countMaterialCells(cells: ArrayLike<number>): Map<number, number> {
  const counts = new Map<number, number>()
  for (let index = 0; index < cells.length; index += 1) {
    const code = cells[index]
    if (code === 0) continue
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return counts
}
