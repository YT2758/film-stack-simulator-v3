import { EMPTY_CELL, cellIndex } from './grid'

export interface ConnectedRegion {
  value: number
  size: number
  touchesBoundary: boolean
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function assertGridShape(cells: Uint8Array, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('width and height must be positive integers')
  }
  if (cells.length !== width * height) throw new RangeError('cells length does not match grid dimensions')
}

/** Deterministic four-neighbour flood fill, returned in row-major discovery order. */
export function findConnectedRegions(
  cells: Uint8Array,
  width: number,
  height: number,
  include: (value: number) => boolean = () => true,
): ConnectedRegion[] {
  assertGridShape(cells, width, height)
  const visited = new Uint8Array(cells.length)
  const regions: ConnectedRegion[] = []
  const queue = new Int32Array(cells.length)

  for (let seed = 0; seed < cells.length; seed += 1) {
    const value = cells[seed]
    if (visited[seed] !== 0 || !include(value)) continue
    let head = 0
    let tail = 0
    queue[tail++] = seed
    visited[seed] = 1
    let size = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    let touchesBoundary = false

    while (head < tail) {
      const current = queue[head++]
      const x = current % width
      const y = Math.floor(current / width)
      size += 1
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      touchesBoundary ||= x === 0 || x === width - 1 || y === 0 || y === height - 1

      const neighbours = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ]
      for (const neighbour of neighbours) {
        if (neighbour < 0 || visited[neighbour] !== 0 || cells[neighbour] !== value) continue
        visited[neighbour] = 1
        queue[tail++] = neighbour
      }
    }
    regions.push({ value, size, touchesBoundary, minX, maxX, minY, maxY })
  }
  return regions
}

export function countEnclosedVoids(cells: Uint8Array, width: number, height: number): number {
  return findConnectedRegions(cells, width, height, (value) => value === EMPTY_CELL).filter(
    (region) => !region.touchesBoundary,
  ).length
}

/** True when all cells of a material belong to one four-neighbour component. */
export function isMaterialConnected(cells: Uint8Array, width: number, height: number, materialCode: number): boolean {
  const regions = findConnectedRegions(cells, width, height, (value) => value === materialCode)
  return regions.length === 1
}

/** Exterior empty cells, used to prevent deposition inside already sealed voids. */
export function exteriorEmptyMask(cells: Uint8Array, width: number, height: number): Uint8Array {
  assertGridShape(cells, width, height)
  const exterior = new Uint8Array(cells.length)
  const queue = new Int32Array(cells.length)
  let head = 0
  let tail = 0
  const enqueue = (x: number, y: number) => {
    const index = cellIndex(width, x, y)
    if (cells[index] !== EMPTY_CELL || exterior[index] !== 0) return
    exterior[index] = 1
    queue[tail++] = index
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 1; y + 1 < height; y += 1) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  while (head < tail) {
    const current = queue[head++]
    const x = current % width
    const y = Math.floor(current / width)
    if (x > 0) enqueue(x - 1, y)
    if (x + 1 < width) enqueue(x + 1, y)
    if (y > 0) enqueue(x, y - 1)
    if (y + 1 < height) enqueue(x, y + 1)
  }
  return exterior
}
