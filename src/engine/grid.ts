import type { FlowDocument } from '../domain/flow'
import { MATERIAL_CODE } from '../domain/materials'

/** Row-major grid. Row zero is the top of the simulation window. */
export interface MaterialGrid {
  width: number
  height: number
  cellSizeNm: number
  cells: Uint8Array
}

export const EMPTY_CELL = 0

export function cellIndex(width: number, x: number, y: number): number {
  return y * width + x
}

export function isInsideGrid(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`)
  }
}

/**
 * Build the authoritative starting cross-section. Base layers are ordered from
 * substrate upward and are clipped if their combined height exceeds the grid.
 */
export function createBaseLayerGrid(document: FlowDocument): MaterialGrid {
  const { width, height, cellSizeNm } = document.grid
  assertPositiveInteger(width, 'grid.width')
  assertPositiveInteger(height, 'grid.height')
  if (!Number.isFinite(cellSizeNm) || cellSizeNm <= 0) {
    throw new RangeError('grid.cellSizeNm must be greater than zero')
  }

  const cells = new Uint8Array(width * height)
  let rowCursor = height

  for (const layer of document.baseLayers) {
    if (!Number.isFinite(layer.thicknessNm) || layer.thicknessNm <= 0) continue
    const layerRows = Math.max(1, Math.round(layer.thicknessNm / cellSizeNm))
    const startRow = Math.max(0, rowCursor - layerRows)
    const materialCode = MATERIAL_CODE[layer.material]
    for (let y = startRow; y < rowCursor; y += 1) {
      cells.fill(materialCode, cellIndex(width, 0, y), cellIndex(width, 0, y) + width)
    }
    rowCursor = startRow
    if (rowCursor === 0) break
  }

  return { width, height, cellSizeNm, cells }
}

export function cloneGrid(grid: MaterialGrid): MaterialGrid {
  return { ...grid, cells: grid.cells.slice() }
}

/** Convert a height measured from the grid bottom into a top-origin row. */
export function heightNmToTopRow(height: number, cellSizeNm: number, heightNm: number): number {
  const rowsFromBottom = Math.round(heightNm / cellSizeNm)
  return Math.max(0, Math.min(height, height - rowsFromBottom))
}
