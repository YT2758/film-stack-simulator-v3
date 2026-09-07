import type { DepositStep, EtchStep, PlanarizeStep, SadpStep } from '../domain/flow'
import { MATERIAL_CODE } from '../domain/materials'
import { exteriorEmptyMask } from './connectivity'
import { EMPTY_CELL, type MaterialGrid, cellIndex, cloneGrid, heightNmToTopRow } from './grid'

function distanceInCells(distanceNm: number, cellSizeNm: number): number {
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) return 0
  return Math.max(1, Math.round(distanceNm / cellSizeNm))
}

function writeMarkedMaterial(grid: MaterialGrid, marked: Uint8Array, materialCode: number): MaterialGrid {
  const next = cloneGrid(grid)
  for (let index = 0; index < marked.length; index += 1) {
    if (marked[index] !== 0 && grid.cells[index] === EMPTY_CELL) next.cells[index] = materialCode
  }
  return next
}

function depositConformal(grid: MaterialGrid, materialCode: number, thicknessCells: number): MaterialGrid {
  const { cells, width, height } = grid
  const exterior = exteriorEmptyMask(cells, width, height)
  const distance = new Int32Array(cells.length)
  distance.fill(-1)
  const queue = new Int32Array(cells.length)
  let head = 0
  let tail = 0

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] === EMPTY_CELL) continue
    distance[index] = 0
    queue[tail++] = index
  }

  while (head < tail) {
    const current = queue[head++]
    const nextDistance = distance[current] + 1
    if (nextDistance > thicknessCells) continue
    const x = current % width
    const y = Math.floor(current / width)
    const neighbours = [
      x > 0 ? current - 1 : -1,
      x + 1 < width ? current + 1 : -1,
      y > 0 ? current - width : -1,
      y + 1 < height ? current + width : -1,
    ]
    for (const neighbour of neighbours) {
      if (neighbour < 0 || distance[neighbour] >= 0) continue
      distance[neighbour] = nextDistance
      queue[tail++] = neighbour
    }
  }

  const marked = new Uint8Array(cells.length)
  for (let index = 0; index < cells.length; index += 1) {
    if (exterior[index] !== 0 && distance[index] > 0 && distance[index] <= thicknessCells) marked[index] = 1
  }
  return writeMarkedMaterial(grid, marked, materialCode)
}

function depositDirectional(
  grid: MaterialGrid,
  materialCode: number,
  thicknessCells: number,
  sidewallCells: number,
): MaterialGrid {
  const { cells, width, height } = grid
  const exterior = exteriorEmptyMask(cells, width, height)
  const marked = new Uint8Array(cells.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = cellIndex(width, x, y)
      if (cells[source] === EMPTY_CELL) continue

      // Material arriving from above grows on every upward-facing surface.
      for (let distance = 1; distance <= thicknessCells; distance += 1) {
        const targetY = y - distance
        if (targetY < 0) break
        const target = cellIndex(width, x, targetY)
        if (cells[target] !== EMPTY_CELL || exterior[target] === 0) break
        marked[target] = 1
      }

      // A reduced lateral rate coats exposed vertical sidewalls.
      for (const direction of [-1, 1]) {
        for (let distance = 1; distance <= sidewallCells; distance += 1) {
          const targetX = x + direction * distance
          if (targetX < 0 || targetX >= width) break
          const target = cellIndex(width, targetX, y)
          if (cells[target] !== EMPTY_CELL || exterior[target] === 0) break
          marked[target] = 1
        }
      }
    }
  }
  return writeMarkedMaterial(grid, marked, materialCode)
}

function depositGapfill(grid: MaterialGrid, materialCode: number, thicknessCells: number): MaterialGrid {
  const { cells, width, height } = grid
  const exterior = exteriorEmptyMask(cells, width, height)
  const marked = new Uint8Array(cells.length)
  const solidOnLeft = new Uint8Array(cells.length)
  const solidOnRight = new Uint8Array(cells.length)

  for (let y = 0; y < height; y += 1) {
    let seenSolid = false
    for (let x = 0; x < width; x += 1) {
      const index = cellIndex(width, x, y)
      solidOnLeft[index] = seenSolid ? 1 : 0
      seenSolid ||= cells[index] !== EMPTY_CELL
    }
    seenSolid = false
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = cellIndex(width, x, y)
      solidOnRight[index] = seenSolid ? 1 : 0
      seenSolid ||= cells[index] !== EMPTY_CELL
    }
  }

  // Gap-fill chemistry is represented by a deterministic bottom-up preference:
  // bounded openings receive twice the nominal vertical growth, with no overhang.
  for (let x = 0; x < width; x += 1) {
    let nearestSolidBelow = -1
    for (let y = height - 1; y >= 0; y -= 1) {
      const index = cellIndex(width, x, y)
      if (cells[index] !== EMPTY_CELL) {
        nearestSolidBelow = y
        continue
      }
      if (nearestSolidBelow < 0 || exterior[index] === 0) continue
      const bounded = solidOnLeft[index] !== 0 && solidOnRight[index] !== 0
      const growthLimit = bounded ? thicknessCells * 2 : thicknessCells
      if (nearestSolidBelow - y <= growthLimit) marked[index] = 1
    }
  }
  return writeMarkedMaterial(grid, marked, materialCode)
}

export function applyDeposit(grid: MaterialGrid, step: DepositStep): MaterialGrid {
  const materialCode = MATERIAL_CODE[step.material]
  const thicknessCells = distanceInCells(step.thicknessNm, grid.cellSizeNm)
  if (thicknessCells === 0) return cloneGrid(grid)
  if (step.mode === 'conformal') return depositConformal(grid, materialCode, thicknessCells)
  if (step.mode === 'gapfill') return depositGapfill(grid, materialCode, thicknessCells)
  const sidewallFactor = Number.isFinite(step.sidewallFactor) ? Math.max(0, step.sidewallFactor) : 0
  const sidewallCells = Math.round(thicknessCells * sidewallFactor)
  return depositDirectional(grid, materialCode, thicknessCells, sidewallCells)
}

function maskSegmentWidths(mask: Uint8Array): Int32Array {
  const widths = new Int32Array(mask.length)
  let start = 0
  while (start < mask.length) {
    if (mask[start] === 0) {
      start += 1
      continue
    }
    let end = start + 1
    while (end < mask.length && mask[end] !== 0) end += 1
    widths.fill(end - start, start, end)
    start = end
  }
  return widths
}

export interface EtchResult {
  grid: MaterialGrid
  etchedDepthNm: number
  maximumRemovedColumn?: number
  maximumRemovedRows: number[]
}

/** Directional, top-down target-equivalent etch with selectivity and ARDE. */
export function applyEtch(grid: MaterialGrid, step: EtchStep, mask: Uint8Array): EtchResult {
  const { width, height, cellSizeNm } = grid
  if (mask.length !== width) throw new RangeError('etch mask width does not match grid width')
  const targetCode = MATERIAL_CODE[step.target]
  const nominalCells = Math.max(0, Number.isFinite(step.depthNm) ? step.depthNm / cellSizeNm : 0)
  const selectivity = Math.max(1e-6, Number.isFinite(step.selectivity) ? step.selectivity : 1)
  const ardeFactor = Math.max(0, Number.isFinite(step.ardeFactor) ? step.ardeFactor : 0)
  const segmentWidths = maskSegmentWidths(mask)
  const next = cloneGrid(grid)
  let maximumRemovedCells = 0
  let maximumRemovedColumn: number | undefined
  let maximumRemovedRows: number[] = []

  for (let x = 0; x < width; x += 1) {
    if (mask[x] === 0 || nominalCells === 0) continue
    const openingWidthNm = Math.max(cellSizeNm, segmentWidths[x] * cellSizeNm)
    const nominalAspectRatio = step.depthNm / openingWidthNm
    let remainingTargetCells = nominalCells / (1 + ardeFactor * nominalAspectRatio)
    let removedCells = 0
    const removedRows: number[] = []
    for (let y = 0; y < height; y += 1) {
      const index = cellIndex(width, x, y)
      const material = next.cells[index]
      if (material === EMPTY_CELL) continue
      const cost = material === targetCode ? 1 : selectivity
      if (remainingTargetCells + 1e-9 < cost) break
      next.cells[index] = EMPTY_CELL
      remainingTargetCells -= cost
      removedCells += 1
      removedRows.push(y)
    }
    if (removedCells > maximumRemovedCells) {
      maximumRemovedCells = removedCells
      maximumRemovedColumn = x
      maximumRemovedRows = removedRows
    }
  }
  return { grid: next, etchedDepthNm: maximumRemovedCells * cellSizeNm, maximumRemovedColumn, maximumRemovedRows }
}

export interface SadpResult {
  grid: MaterialGrid
  lineCentersNm: number[]
}

const MAX_SYNTHETIC_MANDRELS = 4096

export function sadpLineCenters(gridWidthNm: number, step: SadpStep): number[] {
  if (step.mandrelPitchNm <= 0 || step.mandrelWidthNm < 0 || step.spacerThicknessNm <= 0) return []
  if (Math.ceil(gridWidthNm / step.mandrelPitchNm) > MAX_SYNTHETIC_MANDRELS) return []
  const centers: number[] = []
  const halfEdgeOffset = (step.mandrelWidthNm + step.spacerThicknessNm) / 2
  for (
    let mandrelCenter = step.mandrelPitchNm / 2;
    mandrelCenter < gridWidthNm;
    mandrelCenter += step.mandrelPitchNm
  ) {
    const left = mandrelCenter - halfEdgeOffset - step.pitchWalkNm
    const right = mandrelCenter + halfEdgeOffset + step.pitchWalkNm
    if (left >= 0 && left < gridWidthNm) centers.push(left)
    if (right >= 0 && right < gridWidthNm) centers.push(right)
  }
  return centers
}

/** Derive spacer centers from the actual mandrel edges sampled at one layout cut. */
export function sadpLineCentersFromMask(
  mask: Uint8Array,
  cellSizeNm: number,
  step: SadpStep,
): number[] {
  if (mask.length === 0 || step.spacerThicknessNm <= 0) return []
  const centers: number[] = []
  let start = 0
  while (start < mask.length) {
    if (mask[start] === 0) {
      start += 1
      continue
    }
    let end = start + 1
    while (end < mask.length && mask[end] !== 0) end += 1
    const leftEdgeNm = start * cellSizeNm
    const rightEdgeNm = end * cellSizeNm
    const halfSpacerWidth = step.spacerThicknessNm / 2
    const left = leftEdgeNm - halfSpacerWidth - step.pitchWalkNm
    const right = rightEdgeNm + halfSpacerWidth + step.pitchWalkNm
    const gridWidthNm = mask.length * cellSizeNm
    if (left >= 0 && left < gridWidthNm) centers.push(left)
    if (right >= 0 && right < gridWidthNm) centers.push(right)
    start = end
  }
  return centers
}

export function applySadp(
  grid: MaterialGrid,
  step: SadpStep,
  mandrelMask?: Uint8Array,
): SadpResult {
  const next = cloneGrid(grid)
  const materialCode = MATERIAL_CODE[step.spacerMaterial]
  const widthNm = grid.width * grid.cellSizeNm
  if (mandrelMask && mandrelMask.length !== grid.width) {
    throw new RangeError('SADP mandrel mask width does not match grid width')
  }
  const centers = mandrelMask
    ? sadpLineCentersFromMask(mandrelMask, grid.cellSizeNm, step)
    : sadpLineCenters(widthNm, step)
  const halfSpacerWidth = step.spacerThicknessNm / 2
  const spacerHeightCells = distanceInCells(step.spacerHeightNm, grid.cellSizeNm)

  for (let x = 0; x < grid.width; x += 1) {
    const xNm = (x + 0.5) * grid.cellSizeNm
    if (!centers.some((center) => Math.abs(xNm - center) <= halfSpacerWidth)) continue
    let topSolidRow = -1
    for (let y = 0; y < grid.height; y += 1) {
      if (grid.cells[cellIndex(grid.width, x, y)] !== EMPTY_CELL) {
        topSolidRow = y
        break
      }
    }
    if (topSolidRow < 0) continue
    const startRow = Math.max(0, topSolidRow - spacerHeightCells)
    for (let y = startRow; y < topSolidRow; y += 1) {
      const index = cellIndex(grid.width, x, y)
      if (next.cells[index] === EMPTY_CELL) next.cells[index] = materialCode
    }
  }
  return { grid: next, lineCentersNm: centers }
}

export function applyPlanarize(grid: MaterialGrid, step: PlanarizeStep): MaterialGrid {
  const next = cloneGrid(grid)
  const targetRow = heightNmToTopRow(grid.height, grid.cellSizeNm, step.targetHeightNm)
  for (let y = 0; y < targetRow; y += 1) {
    next.cells.fill(EMPTY_CELL, cellIndex(grid.width, 0, y), cellIndex(grid.width, 0, y) + grid.width)
  }
  return next
}
