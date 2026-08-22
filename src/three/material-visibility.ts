export interface MaterialVisibilityState {
  documentId: string
  initialized: boolean
  knownCodes: ReadonlySet<number>
  visibleCodes: ReadonlySet<number>
}

export function createMaterialVisibilityState(documentId: string): MaterialVisibilityState {
  return {
    documentId,
    initialized: false,
    knownCodes: new Set(),
    visibleCodes: new Set(),
  }
}

/**
 * Preserve visibility choices for known materials while defaulting newly
 * appearing materials to visible. A different document always starts fresh.
 */
export function reconcileMaterialVisibility(
  state: MaterialVisibilityState,
  documentId: string,
  materialCodes: Iterable<number>,
): MaterialVisibilityState {
  const current = state.documentId === documentId
    ? state
    : createMaterialVisibilityState(documentId)
  const nextCodes = new Set(materialCodes)

  if (!current.initialized) {
    return {
      documentId,
      initialized: true,
      knownCodes: nextCodes,
      visibleCodes: new Set(nextCodes),
    }
  }

  const knownCodes = new Set(current.knownCodes)
  const visibleCodes = new Set(current.visibleCodes)

  for (const code of nextCodes) {
    if (!knownCodes.has(code)) visibleCodes.add(code)
    knownCodes.add(code)
  }

  return {
    documentId,
    initialized: true,
    knownCodes,
    visibleCodes,
  }
}

export function toggleMaterialVisibility(
  state: MaterialVisibilityState,
  documentId: string,
  materialCode: number,
): MaterialVisibilityState {
  const current = state.documentId === documentId
    ? state
    : createMaterialVisibilityState(documentId)
  const knownCodes = new Set(current.knownCodes)
  const visibleCodes = new Set(current.visibleCodes)
  knownCodes.add(materialCode)

  if (visibleCodes.has(materialCode)) visibleCodes.delete(materialCode)
  else visibleCodes.add(materialCode)

  return {
    documentId,
    initialized: current.initialized,
    knownCodes,
    visibleCodes,
  }
}
