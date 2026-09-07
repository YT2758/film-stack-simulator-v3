import { describe, expect, it } from 'vitest'
import type { DepositStep, FlowDocument, ProcessStep } from '../src/domain/flow'
import { createBlankFlow } from '../src/domain/defaults'
import { MATERIAL_CODE } from '../src/domain/materials'
import {
  computeViaLandedAreaPercent,
  countEnclosedVoids,
  isMaterialConnected,
  sadpLineCenters,
  sampleLayoutMask,
  simulateAtCut,
  simulateFlow,
} from '../src/engine'

function rectangle(x0: number, y0: number, x1: number, y1: number) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

function flow(overrides: Partial<FlowDocument> = {}, steps: ProcessStep[] = []): FlowDocument {
  return {
    schemaVersion: 3,
    id: 'golden-flow',
    name: 'Golden flow',
    description: 'Deterministic engine fixture',
    units: 'nm',
    grid: { width: 30, height: 30, depthSlices: 30, cellSizeNm: 1 },
    baseLayers: [{ id: 'oxide', name: 'Oxide', material: 'silicon-dioxide', thicknessNm: 15 }],
    layout: {
      cutPosition: 0.5,
      features: [
        {
          id: 'opening',
          name: 'Opening',
          role: 'opening',
          points: rectangle(0.4, 0.2, 0.6, 0.8),
          visible: true,
        },
      ],
    },
    steps,
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    ...overrides,
  }
}

const trenchEtch: ProcessStep = {
  id: 'etch',
  name: 'Open trench',
  type: 'etch',
  enabled: true,
  target: 'silicon-dioxide',
  depthNm: 8,
  selectivity: 10,
  ardeFactor: 0,
  mask: 'layout',
  overlayNm: 0,
}

function deposition(mode: 'conformal' | 'directional' | 'gapfill'): DepositStep {
  return {
    id: `deposit-${mode}`,
    name: mode,
    type: 'deposit',
    enabled: true,
    mode,
    material: 'tungsten',
    thicknessNm: 3,
    sidewallFactor: 0,
  }
}

describe('deterministic geometry operations', () => {
  it('explains why the default 90 nm low-k command measures only 6 nm removed', () => {
    const document = createBlankFlow()
    document.steps = [{
      id: 'default-etch',
      name: 'Directional dielectric etch',
      type: 'etch',
      enabled: true,
      target: 'low-k',
      depthNm: 90,
      selectivity: 8,
      ardeFactor: 0.35,
      mask: 'layout',
      overlayNm: 0,
    }]
    const result = simulateAtCut(document)

    // At the 72 nm mask opening, ARDE reduces the target-equivalent budget.
    // Each non-target photoresist cell costs 8 target-equivalent units. The
    // reduced budget removes only 3 PR cells at 2 nm/cell and stops before low-k.
    expect(result.metrics.openColumns).toBe(36)
    expect(result.metrics.etchedDepthNm).toBe(6)
    expect(result.metrics.etchedDepthMeasurement?.removedRows).toHaveLength(3)
  })

  it('fails closed instead of enumerating an unresolvable SADP pitch', () => {
    expect(sadpLineCenters(1000, {
      id: 'unsafe-sadp',
      name: 'Unsafe SADP',
      type: 'sadp',
      enabled: true,
      spacerMaterial: 'spacer',
      mandrelPitchNm: 0.000001,
      mandrelWidthNm: 8,
      spacerThicknessNm: 4,
      spacerHeightNm: 24,
      pitchWalkNm: 0,
    })).toEqual([])
  })

  it('distinguishes conformal, directional, and bottom-up gap-fill deposition', () => {
    const conformal = simulateAtCut(flow({}, [trenchEtch, deposition('conformal')]))
    const directional = simulateAtCut(flow({}, [trenchEtch, deposition('directional')]))
    const gapfill = simulateAtCut(flow({}, [trenchEtch, deposition('gapfill')]))
    const sidewallProbe = 17 * conformal.width + 12
    const bottomProbe = 20 * conformal.width + 14

    expect(conformal.cells[sidewallProbe]).toBe(MATERIAL_CODE.tungsten)
    expect(directional.cells[sidewallProbe]).toBe(0)
    expect(gapfill.cells[sidewallProbe]).toBe(MATERIAL_CODE.tungsten)
    expect(directional.cells[bottomProbe]).toBe(MATERIAL_CODE.tungsten)
    expect([...conformal.cells]).not.toEqual([...directional.cells])
    expect([...gapfill.cells]).not.toEqual([...directional.cells])
  })

  it('consumes target-equivalent etch budget according to selectivity', () => {
    const base = {
      grid: { width: 12, height: 25, depthSlices: 12, cellSizeNm: 1 },
      baseLayers: [
        { id: 'si', name: 'Silicon', material: 'silicon' as const, thicknessNm: 10 },
        { id: 'oxide', name: 'Oxide', material: 'silicon-dioxide' as const, thicknessNm: 10 },
      ],
    }
    const etch = (selectivity: number): ProcessStep => ({
      id: `selectivity-${selectivity}`,
      name: 'Blanket oxide etch',
      type: 'etch',
      enabled: true,
      target: 'silicon-dioxide',
      depthNm: 15,
      selectivity,
      ardeFactor: 0,
      mask: 'blanket',
      overlayNm: 0,
    })
    const high = simulateAtCut(flow(base, [etch(10)]))
    const low = simulateAtCut(flow(base, [etch(1)]))
    const siliconTopProbe = 15 * high.width + 5

    expect(high.cells[siliconTopProbe]).toBe(MATERIAL_CODE.silicon)
    expect(low.cells[siliconTopProbe]).toBe(0)
    expect(high.metrics.etchedDepthNm).toBe(10)
    expect(low.metrics.etchedDepthNm).toBe(15)
  })

  it('samples arbitrary polygons at the requested normalized cut and overlay', () => {
    const document = flow()
    expect([...sampleLayoutMask(document, 0.5)].reduce((sum, value) => sum + value, 0)).toBe(6)
    expect([...sampleLayoutMask(document, 0.1)].reduce((sum, value) => sum + value, 0)).toBe(0)
    const shifted = sampleLayoutMask(document, 0.5, { overlayNm: 3 })
    expect(shifted[12]).toBe(0)
    expect(shifted[15]).toBe(1)
  })

  it('is pure, deterministic, and preserves timeline indices including the base', () => {
    const document = flow({}, [trenchEtch, deposition('conformal')])
    const before = JSON.stringify(document)
    const first = simulateFlow(document)
    const second = simulateFlow(document)

    expect(first).toHaveLength(3)
    expect(first.map((snapshot) => snapshot.stepIndex)).toEqual([-1, 0, 1])
    expect([...first[2].cells]).toEqual([...second[2].cells])
    expect(JSON.stringify(document)).toBe(before)
    expect(simulateAtCut(document, 0.5, -1).stepName).toBe('Base stack')
  })

  it('planarizes all material above the requested bottom-referenced height', () => {
    const blanketDeposit: DepositStep = {
      ...deposition('directional'),
      thicknessNm: 5,
    }
    const planarize: ProcessStep = {
      id: 'cmp',
      name: 'CMP',
      type: 'planarize',
      enabled: true,
      targetHeightNm: 16,
    }
    const snapshot = simulateAtCut(flow({}, [blanketDeposit, planarize]))
    expect(snapshot.cells[13 * snapshot.width + 2]).toBe(0)
    expect(snapshot.cells[14 * snapshot.width + 2]).toBe(MATERIAL_CODE.tungsten)
  })
})

describe('connectivity and top-down metrics', () => {
  it('counts sealed voids with four-neighbour flood fill', () => {
    const sealed = new Uint8Array(25).fill(MATERIAL_CODE['silicon-dioxide'])
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) sealed[y * 5 + x] = 0
    }
    expect(countEnclosedVoids(sealed, 5, 5)).toBe(1)
    sealed[2] = 0
    expect(countEnclosedVoids(sealed, 5, 5)).toBe(0)
    expect(isMaterialConnected(sealed, 5, 5, MATERIAL_CODE['silicon-dioxide'])).toBe(true)
  })

  it('measures via-to-metal landed area on the top-down grid', () => {
    const document = flow({
      grid: { width: 100, height: 30, depthSlices: 96, cellSizeNm: 1 },
      layout: {
        cutPosition: 0.5,
        features: [
          { id: 'metal', name: 'Metal', role: 'metal', points: rectangle(0.2, 0.2, 0.6, 0.8), visible: true },
          { id: 'via', name: 'Via', role: 'via', points: rectangle(0.4, 0.3, 0.8, 0.7), visible: true },
        ],
      },
    })
    expect(computeViaLandedAreaPercent(document, 0)).toBe(50)
    expect(computeViaLandedAreaPercent(document, 10)).toBe(25)
  })
})
