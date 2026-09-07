import type { SimulationSnapshot } from '../domain/flow'

export interface MaterialCellInspection {
  x: number
  y: number
  materialCode: number
  xNm: number
  heightNm: number
  localVerticalThicknessNm: number
  runTopRow: number
  runBottomRow: number
}

export function inspectSnapshotCell(
  snapshot: SimulationSnapshot,
  x: number,
  y: number,
): MaterialCellInspection | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= snapshot.width || y < 0 || y >= snapshot.height) return null
  const materialCode = snapshot.cells[y * snapshot.width + x]
  if (materialCode === 0) return null
  let runTopRow = y
  let runBottomRow = y
  while (runTopRow > 0 && snapshot.cells[(runTopRow - 1) * snapshot.width + x] === materialCode) runTopRow -= 1
  while (runBottomRow + 1 < snapshot.height && snapshot.cells[(runBottomRow + 1) * snapshot.width + x] === materialCode) runBottomRow += 1
  return {
    x,
    y,
    materialCode,
    xNm: (x + 0.5) * snapshot.cellSizeNm,
    heightNm: (snapshot.height - y - 0.5) * snapshot.cellSizeNm,
    localVerticalThicknessNm: (runBottomRow - runTopRow + 1) * snapshot.cellSizeNm,
    runTopRow,
    runBottomRow,
  }
}

export function connectedMaterialRegion(snapshot: SimulationSnapshot, x: number, y: number): Set<number> {
  const inspection = inspectSnapshotCell(snapshot, x, y)
  if (!inspection) return new Set()
  const result = new Set<number>()
  const queue = [y * snapshot.width + x]
  while (queue.length > 0) {
    const index = queue.pop() as number
    if (result.has(index) || snapshot.cells[index] !== inspection.materialCode) continue
    result.add(index)
    const cellX = index % snapshot.width
    const cellY = Math.floor(index / snapshot.width)
    if (cellX > 0) queue.push(index - 1)
    if (cellX + 1 < snapshot.width) queue.push(index + 1)
    if (cellY > 0) queue.push(index - snapshot.width)
    if (cellY + 1 < snapshot.height) queue.push(index + snapshot.width)
  }
  return result
}
