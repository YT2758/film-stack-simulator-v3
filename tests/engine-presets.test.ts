import { describe, expect, it } from 'vitest'
import { MATERIAL_CODE } from '../src/domain/materials'
import { simulateAtCut } from '../src/engine'
import { validateFlowDocument } from '../src/persistence/flow-codec'
import { PRESETS, getPresetById } from '../src/presets'

describe('preset registry and golden scenarios', () => {
  it('returns all valid presets and gracefully rejects an unknown id', () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      'arde-demo',
      'sadp-pitch-walking',
      'borderless-via-margin',
    ])
    expect(getPresetById('arde-demo')?.articleSlug).toBe('arde-deep-etch-slower')
    expect(getPresetById('not-a-preset')).toBeUndefined()
    for (const preset of PRESETS) {
      expect(() => validateFlowDocument(preset.document)).not.toThrow()
      expect(preset.document.schemaVersion).toBe(3)
      expect(preset.document.id).toBe(preset.id)
      expect(preset.document.units).toBe('nm')
      expect(preset.document.steps.length).toBeGreaterThan(0)
    }
  })

  it('creates exactly two SADP spacer lines per mandrel pitch', () => {
    const preset = getPresetById('sadp-pitch-walking')!
    const snapshot = simulateAtCut(preset.document)
    const sadp = preset.document.steps[0]
    if (sadp.type !== 'sadp') throw new Error('fixture is not SADP')
    const pitchCount = (preset.document.grid.width * preset.document.grid.cellSizeNm) / sadp.mandrelPitchNm
    const centers = snapshot.metrics.spacerLineCentersNm ?? []

    expect(centers).toHaveLength(pitchCount * 2)
    expect(centers.slice(0, 4)).toEqual([16, 64, 96, 144])
    expect(snapshot.cells).toContain(MATERIAL_CODE.spacer)
  })

  it('reports the shifted borderless-via overlap from the same flow document', () => {
    const preset = getPresetById('borderless-via-margin')!
    const snapshot = simulateAtCut(preset.document)
    expect(snapshot.metrics.viaLandedAreaPercent).toBeCloseTo(28.125, 6)
  })

  it('shapes the borderless-via copper base with the authoritative metal polygon', () => {
    const preset = getPresetById('borderless-via-margin')!
    const throughLine = simulateAtCut(preset.document, 0.5, -1)
    const outsideLine = simulateAtCut(preset.document, 0.1, -1)
    const copper = MATERIAL_CODE.copper
    const lowK = MATERIAL_CODE['low-k']
    const copperRow = 95

    expect(throughLine.cells[copperRow * throughLine.width + 70]).toBe(copper)
    expect(throughLine.cells[copperRow * throughLine.width + 20]).toBe(lowK)
    expect([...outsideLine.cells]).not.toContain(copper)
  })

  it('uses top-down mandrel edges and Y extent for SADP spacer geometry', () => {
    const preset = getPresetById('sadp-pitch-walking')!
    const throughMandrels = simulateAtCut(preset.document, 0.5)
    const outsideMandrels = simulateAtCut(preset.document, 0.02)

    expect(throughMandrels.metrics.spacerLineCentersNm?.slice(0, 4)).toEqual([16, 64, 96, 144])
    expect(throughMandrels.cells).toContain(MATERIAL_CODE.spacer)
    expect(outsideMandrels.metrics.spacerLineCentersNm).toEqual([])
    expect(outsideMandrels.cells).not.toContain(MATERIAL_CODE.spacer)
  })

  it('etches the wider ARDE opening deeper than the narrow opening', () => {
    const preset = getPresetById('arde-demo')!
    const snapshot = simulateAtCut(preset.document)
    const lowK = MATERIAL_CODE['low-k']
    const firstSolidRow = (x: number) => {
      for (let y = 0; y < snapshot.height; y += 1) {
        if (snapshot.cells[y * snapshot.width + x] === lowK) return y
      }
      return snapshot.height
    }
    expect(firstSolidRow(107)).toBeGreaterThan(firstSolidRow(27))
  })
})
