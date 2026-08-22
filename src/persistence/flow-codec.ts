import {
  FLOW_SCHEMA_VERSION,
  type FlowDocument,
  type LayoutFeature,
  type ProcessStep,
} from '../domain/flow'

const MATERIALS = new Set([
  'silicon', 'silicon-dioxide', 'silicon-nitride', 'photoresist', 'polysilicon',
  'tungsten', 'copper', 'low-k', 'spacer',
])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function validateFeature(value: unknown, index: number): asserts value is LayoutFeature {
  assert(typeof value === 'object' && value !== null, `Layout feature ${index} is invalid.`)
  const feature = value as Record<string, unknown>
  assert(typeof feature.id === 'string' && typeof feature.name === 'string', `Layout feature ${index} needs an id and name.`)
  assert(['opening', 'via', 'metal', 'mandrel', 'guide'].includes(String(feature.role)), `Layout feature ${index} has an unknown role.`)
  assert(Array.isArray(feature.points) && feature.points.length >= 3, `Layout feature ${index} needs at least three points.`)
  for (const point of feature.points) {
    assert(typeof point === 'object' && point !== null, `Layout feature ${index} has an invalid point.`)
    const candidate = point as Record<string, unknown>
    assert(isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y), `Layout feature ${index} has a non-numeric point.`)
    assert(candidate.x >= 0 && candidate.x <= 1 && candidate.y >= 0 && candidate.y <= 1, `Layout feature ${index} has a point outside 0–1.`)
  }
}

function validateStep(value: unknown, index: number, gridCellSizeNm: number): asserts value is ProcessStep {
  assert(typeof value === 'object' && value !== null, `Process step ${index} is invalid.`)
  const step = value as Record<string, unknown>
  assert(typeof step.id === 'string' && typeof step.name === 'string' && typeof step.enabled === 'boolean', `Process step ${index} needs id, name, and enabled.`)
  assert(['deposit', 'etch', 'sadp', 'planarize'].includes(String(step.type)), `Process step ${index} has an unknown type.`)
  if (step.type === 'deposit') {
    assert(['conformal', 'directional', 'gapfill'].includes(String(step.mode)), `Deposit step ${index} has an unknown mode.`)
    assert(MATERIALS.has(String(step.material)), `Deposit step ${index} has an unknown material.`)
    assert(isFiniteNumber(step.thicknessNm) && step.thicknessNm >= 0, `Deposit step ${index} has an invalid thickness.`)
    assert(isFiniteNumber(step.sidewallFactor) && step.sidewallFactor >= 0 && step.sidewallFactor <= 1, `Deposit step ${index} has an invalid sidewall factor.`)
  } else if (step.type === 'etch') {
    assert(MATERIALS.has(String(step.target)), `Etch step ${index} has an unknown target.`)
    assert(isFiniteNumber(step.depthNm) && step.depthNm >= 0, `Etch step ${index} has an invalid depth.`)
    assert(isFiniteNumber(step.selectivity) && step.selectivity >= 1, `Etch step ${index} has an invalid selectivity.`)
    assert(isFiniteNumber(step.ardeFactor) && step.ardeFactor >= 0, `Etch step ${index} has an invalid ARDE factor.`)
    assert(['layout', 'blanket'].includes(String(step.mask)), `Etch step ${index} has an unknown mask.`)
    assert(isFiniteNumber(step.overlayNm), `Etch step ${index} has an invalid overlay.`)
  } else if (step.type === 'sadp') {
    assert(MATERIALS.has(String(step.spacerMaterial)), `SADP step ${index} has an unknown spacer material.`)
    assert(
      isFiniteNumber(step.mandrelPitchNm) && step.mandrelPitchNm >= gridCellSizeNm,
      `SADP step ${index} mandrel pitch must be at least one grid cell (${gridCellSizeNm} nm).`,
    )
    assert(isFiniteNumber(step.mandrelWidthNm) && step.mandrelWidthNm >= 0, `SADP step ${index} has an invalid mandrelWidthNm.`)
    assert(isFiniteNumber(step.spacerThicknessNm) && step.spacerThicknessNm > 0, `SADP step ${index} has an invalid spacerThicknessNm.`)
    assert(isFiniteNumber(step.spacerHeightNm) && step.spacerHeightNm >= 0, `SADP step ${index} has an invalid spacerHeightNm.`)
    assert(isFiniteNumber(step.pitchWalkNm), `SADP step ${index} has an invalid pitchWalkNm.`)
  } else {
    assert(isFiniteNumber(step.targetHeightNm) && step.targetHeightNm >= 0, `Planarize step ${index} has an invalid target height.`)
  }
}

export function validateFlowDocument(value: unknown): FlowDocument {
  assert(typeof value === 'object' && value !== null, 'This file does not contain a flow document.')
  const document = value as Record<string, unknown>
  assert(document.schemaVersion === FLOW_SCHEMA_VERSION, `Unsupported flow schema. Expected v${FLOW_SCHEMA_VERSION}.`)
  assert(typeof document.id === 'string' && typeof document.name === 'string', 'The flow needs an id and name.')
  assert(typeof document.description === 'string' && document.units === 'nm', 'The flow description or units are invalid.')
  assert(typeof document.grid === 'object' && document.grid !== null, 'The grid definition is missing.')
  const grid = document.grid as Record<string, unknown>
  assert(isInteger(grid.width) && grid.width >= 24 && grid.width <= 512, 'Grid width must be an integer between 24 and 512 cells.')
  assert(isInteger(grid.height) && grid.height >= 24 && grid.height <= 512, 'Grid height must be an integer between 24 and 512 cells.')
  assert(isInteger(grid.depthSlices) && grid.depthSlices >= 4 && grid.depthSlices <= 96, 'Depth slices must be an integer between 4 and 96.')
  assert(isFiniteNumber(grid.cellSizeNm) && grid.cellSizeNm > 0 && grid.cellSizeNm <= 100, 'Cell size must be greater than 0 and at most 100 nm.')
  assert(Array.isArray(document.baseLayers) && document.baseLayers.length > 0 && document.baseLayers.length <= 32, 'The base stack needs 1–32 layers.')
  for (const [index, layerValue] of document.baseLayers.entries()) {
    assert(typeof layerValue === 'object' && layerValue !== null, `Base layer ${index} is invalid.`)
    const layer = layerValue as Record<string, unknown>
    assert(typeof layer.id === 'string' && typeof layer.name === 'string', `Base layer ${index} needs an id and name.`)
    assert(MATERIALS.has(String(layer.material)), `Base layer ${index} has an unknown material.`)
    assert(isFiniteNumber(layer.thicknessNm) && layer.thicknessNm > 0, `Base layer ${index} has an invalid thickness.`)
  }
  assert(typeof document.layout === 'object' && document.layout !== null, 'The top-down layout is missing.')
  const layout = document.layout as Record<string, unknown>
  assert(isFiniteNumber(layout.cutPosition) && layout.cutPosition >= 0 && layout.cutPosition <= 1, 'The cut position must be between 0 and 1.')
  assert(Array.isArray(layout.features) && layout.features.length <= 128, 'The layout features are invalid.')
  layout.features.forEach(validateFeature)
  assert(Array.isArray(document.steps) && document.steps.length <= 128, 'The process steps are invalid.')
  document.steps.forEach((step, index) => validateStep(step, index, grid.cellSizeNm as number))
  assert(typeof document.createdAt === 'string' && typeof document.updatedAt === 'string', 'The flow timestamps are missing.')
  return structuredClone(document) as unknown as FlowDocument
}

export function parseFlowJson(text: string): FlowDocument {
  if (text.length > 5_000_000) throw new Error('The import is larger than the 5 MB safety limit.')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  if (typeof value === 'object' && value !== null && 'document' in value) {
    value = (value as { document: unknown }).document
  }
  return validateFlowDocument(value)
}

export function stringifyFlow(document: FlowDocument): string {
  return `${JSON.stringify(validateFlowDocument(document), null, 2)}\n`
}
