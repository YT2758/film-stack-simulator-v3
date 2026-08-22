import { describe, expect, it } from 'vitest'
import {
  createMaterialVisibilityState,
  reconcileMaterialVisibility,
  toggleMaterialVisibility,
} from '../src/three/material-visibility'

describe('3D material visibility', () => {
  it('preserves hidden materials across rebuilds and reveals only newly appearing codes', () => {
    let state = createMaterialVisibilityState('document-a')
    expect(state.initialized).toBe(false)

    state = reconcileMaterialVisibility(state, 'document-a', [1, 2])
    expect(state.initialized).toBe(true)
    expect([...state.visibleCodes]).toEqual([1, 2])

    state = toggleMaterialVisibility(state, 'document-a', 2)
    state = reconcileMaterialVisibility(state, 'document-a', [1, 2])
    expect([...state.visibleCodes]).toEqual([1])

    state = reconcileMaterialVisibility(state, 'document-a', [1])
    state = reconcileMaterialVisibility(state, 'document-a', [2, 3])
    expect([...state.visibleCodes]).toEqual([1, 3])
    expect([...state.knownCodes]).toEqual([1, 2, 3])

    state = reconcileMaterialVisibility(state, 'document-b', [2])
    expect([...state.visibleCodes]).toEqual([2])
  })
})
