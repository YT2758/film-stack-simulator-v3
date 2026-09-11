import { describe, expect, it } from 'vitest'
import { deflate } from 'pako'
import { createBlankFlow } from '../src/domain/defaults'
import { decodeFlowFragment, encodeFlowFragment } from '../src/persistence/share-codec'
import { parseFlowJson, stringifyFlow, validateFlowDocument } from '../src/persistence/flow-codec'

describe('flow document boundary', () => {
  it('round-trips the canonical v3 JSON format semantically', () => {
    const document = createBlankFlow()
    document.name = 'Round-trip fixture'
    const restored = parseFlowJson(stringifyFlow(document))
    expect(restored).toEqual(document)
    expect(restored).not.toBe(document)
  })

  it('accepts a preset-style document wrapper', () => {
    const document = createBlankFlow()
    expect(parseFlowJson(JSON.stringify({ document }))).toEqual(document)
  })

  it('rejects unknown schemas and unsafe grid sizes', () => {
    const document = createBlankFlow()
    expect(() => validateFlowDocument({ ...document, schemaVersion: 2 })).toThrow(/Unsupported flow schema/u)
    expect(() => validateFlowDocument({ ...document, grid: { ...document.grid, width: 10_000 } })).toThrow(/Grid width/u)
    expect(() => parseFlowJson('{broken')).toThrow(/not valid JSON/u)
  })

  it.each([
    ['width', 112.5, /Grid width.*integer/u],
    ['height', 84.5, /Grid height.*integer/u],
    ['depthSlices', 24.5, /Depth slices.*integer/u],
  ] as const)('rejects a fractional grid %s', (field, value, expectedMessage) => {
    const document = createBlankFlow()
    expect(() => validateFlowDocument({
      ...document,
      grid: { ...document.grid, [field]: value },
    })).toThrow(expectedMessage)
  })

  it('rejects a SADP pitch finer than one grid cell', () => {
    const document = createBlankFlow()
    document.steps = [{
      id: 'unsafe-sadp',
      name: 'Unsafe SADP',
      type: 'sadp',
      enabled: true,
      spacerMaterial: 'spacer',
      mandrelPitchNm: document.grid.cellSizeNm / 1000,
      mandrelWidthNm: 8,
      spacerThicknessNm: 4,
      spacerHeightNm: 24,
      pitchWalkNm: 0,
    }]

    expect(() => validateFlowDocument(document)).toThrow(/pitch must be at least one grid cell/u)
  })
})

describe('URL fragment sharing', () => {
  it('compresses and restores a validated document', () => {
    const document = createBlankFlow()
    document.description = 'Sensitive names should be removed before this link is shared.'
    const fragment = encodeFlowFragment(document)
    expect(fragment.startsWith('state=')).toBe(true)
    expect(fragment.length).toBeLessThan(stringifyFlow(document).length)
    expect(decodeFlowFragment(`#${fragment}`)).toEqual(document)
  })

  it('rejects damaged fragments without falling back to arbitrary state', () => {
    expect(() => decodeFlowFragment('state=not-a-valid-deflate-stream')).toThrow(/damaged/u)
  })

  it('rejects a highly compressible fragment that expands past the output limit', () => {
    const document = createBlankFlow()
    document.description = 'A'.repeat(5_000_000)
    // Construct untrusted input directly; the encoder now refuses to create it.
    const bytes = deflate(new TextEncoder().encode(stringifyFlow(document)))
    const fragment = 'state=' + btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

    expect(fragment.length).toBeLessThan(120_000)
    expect(() => decodeFlowFragment(fragment)).toThrow(/expands beyond the 5 MB safety limit/u)
  })

  it('never creates a link that exceeds its own decoded byte limit', () => {
    const document = createBlankFlow()
    document.description = '層'.repeat(1_700_000)
    expect(() => encodeFlowFragment(document)).toThrow(/share link safety limit/u)
  })
})
