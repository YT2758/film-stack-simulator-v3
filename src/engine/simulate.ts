import type {
  FlowDocument,
  MaterialId,
  ProcessStep,
  SimulationMetrics,
  SimulationSnapshot,
} from '../domain/flow'
import { countEnclosedVoids } from './connectivity'
import { EMPTY_CELL, cellIndex, createBaseLayerGrid, type MaterialGrid } from './grid'
import { computeViaLandedAreaPercent, sampleLayoutMask } from './layout'
import { applyDeposit, applyEtch, applyPlanarize, applySadp } from './operations'
import { MATERIAL_CODE } from '../domain/materials'

const LINE_MATERIALS = new Set<MaterialId>(['copper', 'tungsten'])

/**
 * Shape starting interconnect layers with the sampled top-down metal polygons.
 * Outside a metal polygon, the next non-metal layer above fills that thickness;
 * this makes the 2D cut and every 3D depth slice describe the same landed line.
 */
function createLayoutAwareBaseGrid(document: FlowDocument, cutPosition: number): MaterialGrid {
  const grid = createBaseLayerGrid(document)
  const hasMetalLayout = document.layout.features.some(
    (feature) => feature.visible && feature.role === 'metal',
  )
  if (!hasMetalLayout) return grid

  const metalMask = sampleLayoutMask(document, cutPosition, { roles: ['metal'] })
  let rowCursor = grid.height
  for (let layerIndex = 0; layerIndex < document.baseLayers.length; layerIndex += 1) {
    const layer = document.baseLayers[layerIndex]
    const layerRows = Math.max(1, Math.round(layer.thicknessNm / grid.cellSizeNm))
    const startRow = Math.max(0, rowCursor - layerRows)
    if (LINE_MATERIALS.has(layer.material)) {
      let fillCode = EMPTY_CELL
      for (let candidate = layerIndex + 1; candidate < document.baseLayers.length; candidate += 1) {
        const fillMaterial = document.baseLayers[candidate].material
        if (!LINE_MATERIALS.has(fillMaterial)) {
          fillCode = MATERIAL_CODE[fillMaterial]
          break
        }
      }
      for (let x = 0; x < grid.width; x += 1) {
        if (metalMask[x] !== 0) continue
        for (let y = startRow; y < rowCursor; y += 1) {
          grid.cells[cellIndex(grid.width, x, y)] = fillCode
        }
      }
    }
    rowCursor = startRow
    if (rowCursor === 0) break
  }
  return grid
}

interface SimulationState {
  grid: MaterialGrid
  etchedDepthNm: number
  spacerLineCentersNm?: number[]
  overlayNm: number
}

function blanketMask(width: number): Uint8Array {
  const mask = new Uint8Array(width)
  mask.fill(1)
  return mask
}

function applyStep(
  document: FlowDocument,
  state: SimulationState,
  step: ProcessStep,
  cutPosition: number,
): SimulationState {
  if (!step.enabled) return state
  if (step.type === 'deposit') return { ...state, grid: applyDeposit(state.grid, step) }
  if (step.type === 'planarize') return { ...state, grid: applyPlanarize(state.grid, step) }
  if (step.type === 'sadp') {
    const hasMandrelLayout = document.layout.features.some(
      (feature) => feature.visible && feature.role === 'mandrel',
    )
    const mandrelMask = hasMandrelLayout
      ? sampleLayoutMask(document, cutPosition, { roles: ['mandrel'] })
      : undefined
    const result = applySadp(state.grid, step, mandrelMask)
    return { ...state, grid: result.grid, spacerLineCentersNm: result.lineCentersNm }
  }

  const overlayNm = step.mask === 'layout' ? step.overlayNm : state.overlayNm
  const mask =
    step.mask === 'blanket'
      ? blanketMask(state.grid.width)
      : sampleLayoutMask(document, cutPosition, { overlayNm: step.overlayNm })
  const result = applyEtch(state.grid, step, mask)
  return {
    ...state,
    grid: result.grid,
    etchedDepthNm: Math.max(state.etchedDepthNm, result.etchedDepthNm),
    overlayNm,
  }
}

function metricsFor(document: FlowDocument, state: SimulationState, cutPosition: number): SimulationMetrics {
  const openingMask = sampleLayoutMask(document, cutPosition, { overlayNm: state.overlayNm })
  let openColumns = 0
  for (const value of openingMask) openColumns += value === 0 ? 0 : 1
  return {
    openColumns,
    etchedDepthNm: state.etchedDepthNm,
    voidCount: countEnclosedVoids(state.grid.cells, state.grid.width, state.grid.height),
    viaLandedAreaPercent: computeViaLandedAreaPercent(document, state.overlayNm),
    spacerLineCentersNm: state.spacerLineCentersNm ? [...state.spacerLineCentersNm] : undefined,
  }
}

function snapshotFor(
  document: FlowDocument,
  state: SimulationState,
  cutPosition: number,
  stepIndex: number,
  stepName: string,
): SimulationSnapshot {
  return {
    width: state.grid.width,
    height: state.grid.height,
    cellSizeNm: state.grid.cellSizeNm,
    cells: state.grid.cells.slice(),
    stepIndex,
    stepName,
    metrics: metricsFor(document, state, cutPosition),
  }
}

/**
 * Replay the complete flow at one normalized top-down cut position. The first
 * snapshot is the base stack (`stepIndex === -1`), followed by one snapshot per
 * process step, including disabled steps so timeline indices remain stable.
 */
export function simulateFlow(document: FlowDocument, cutPosition = document.layout.cutPosition): SimulationSnapshot[] {
  const normalizedCut = Math.max(0, Math.min(1, Number.isFinite(cutPosition) ? cutPosition : document.layout.cutPosition))
  let state: SimulationState = {
    grid: createLayoutAwareBaseGrid(document, normalizedCut),
    etchedDepthNm: 0,
    overlayNm: 0,
  }
  const snapshots = [snapshotFor(document, state, normalizedCut, -1, 'Base stack')]
  document.steps.forEach((step, stepIndex) => {
    state = applyStep(document, state, step, normalizedCut)
    snapshots.push(snapshotFor(document, state, normalizedCut, stepIndex, step.name))
  })
  return snapshots
}

/**
 * Return the state through a zero-based inclusive process-step index. `-1`
 * selects the base stack and omitted/out-of-range high values select the final
 * state. The function never mutates the supplied document.
 */
export function simulateAtCut(
  document: FlowDocument,
  cutPosition = document.layout.cutPosition,
  throughStep = document.steps.length - 1,
): SimulationSnapshot {
  const snapshots = simulateFlow(document, cutPosition)
  const requested = Number.isFinite(throughStep) ? Math.floor(throughStep) : document.steps.length - 1
  const clampedStep = Math.max(-1, Math.min(document.steps.length - 1, requested))
  return snapshots[clampedStep + 1]
}
