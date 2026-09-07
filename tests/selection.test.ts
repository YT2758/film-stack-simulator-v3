import { describe, expect, it } from 'vitest'
import type { SimulationSnapshot } from '../src/domain/flow'
import { connectedMaterialRegion, inspectSnapshotCell } from '../src/engine/selection'

const snapshot: SimulationSnapshot = {
  width: 3,
  height: 4,
  cellSizeNm: 2,
  cells: Uint8Array.from([
    0, 1, 0,
    0, 1, 2,
    1, 1, 2,
    1, 0, 2,
  ]),
  stepIndex: 0,
  stepName: 'Selection fixture',
  metrics: { openColumns: 0, etchedDepthNm: 0, voidCount: 0 },
}

describe('authoritative 2D material selection', () => {
  it('reports a contiguous local vertical thickness and physical cell centre', () => {
    expect(inspectSnapshotCell(snapshot, 1, 1)).toEqual({
      x: 1,
      y: 1,
      materialCode: 1,
      xNm: 3,
      heightNm: 5,
      localVerticalThicknessNm: 6,
      runTopRow: 0,
      runBottomRow: 2,
    })
    expect(inspectSnapshotCell(snapshot, 0, 0)).toBeNull()
    expect(inspectSnapshotCell(snapshot, -1, 0)).toBeNull()
  })

  it('highlights only the connected region of the selected material', () => {
    expect([...connectedMaterialRegion(snapshot, 1, 1)].sort((a, b) => a - b)).toEqual([1, 4, 6, 7, 9])
    expect(connectedMaterialRegion(snapshot, 0, 0).size).toBe(0)
  })
})
