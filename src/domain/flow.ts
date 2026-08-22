export const FLOW_SCHEMA_VERSION = 3 as const

export type MaterialId =
  | 'silicon'
  | 'silicon-dioxide'
  | 'silicon-nitride'
  | 'photoresist'
  | 'polysilicon'
  | 'tungsten'
  | 'copper'
  | 'low-k'
  | 'spacer'

export type DepositionMode = 'conformal' | 'directional' | 'gapfill'

export interface Point2D {
  /** Normalized X coordinate in the top-down layout, from 0 to 1. */
  x: number
  /** Normalized Y coordinate in the top-down layout, from 0 to 1. */
  y: number
}

export type LayoutRole = 'opening' | 'via' | 'metal' | 'mandrel' | 'guide'

export interface LayoutFeature {
  id: string
  name: string
  role: LayoutRole
  points: Point2D[]
  visible: boolean
}

export interface LayoutDefinition {
  features: LayoutFeature[]
  /** Normalized Y position sampled by the authoritative 2D cross-section. */
  cutPosition: number
}

export interface GridSpec {
  width: number
  height: number
  depthSlices: number
  cellSizeNm: number
}

export interface BaseLayer {
  id: string
  name: string
  material: MaterialId
  thicknessNm: number
}

interface StepBase {
  id: string
  name: string
  enabled: boolean
}

export interface DepositStep extends StepBase {
  type: 'deposit'
  mode: DepositionMode
  material: MaterialId
  thicknessNm: number
  /** Fraction of the nominal rate applied to vertical sidewalls in directional mode. */
  sidewallFactor: number
}

export interface EtchStep extends StepBase {
  type: 'etch'
  target: MaterialId
  depthNm: number
  /** Target etch rate divided by the other-material etch rate. */
  selectivity: number
  /** Dimensionless geometric loading term; zero disables the ARDE rule. */
  ardeFactor: number
  mask: 'layout' | 'blanket'
  overlayNm: number
}

export interface SadpStep extends StepBase {
  type: 'sadp'
  spacerMaterial: MaterialId
  mandrelPitchNm: number
  mandrelWidthNm: number
  spacerThicknessNm: number
  spacerHeightNm: number
  /** Alternating edge displacement used to demonstrate pitch walking. */
  pitchWalkNm: number
}

export interface PlanarizeStep extends StepBase {
  type: 'planarize'
  targetHeightNm: number
}

export type ProcessStep = DepositStep | EtchStep | SadpStep | PlanarizeStep

export interface FlowDocument {
  schemaVersion: typeof FLOW_SCHEMA_VERSION
  id: string
  name: string
  description: string
  units: 'nm'
  grid: GridSpec
  baseLayers: BaseLayer[]
  layout: LayoutDefinition
  steps: ProcessStep[]
  createdAt: string
  updatedAt: string
}

export interface SimulationMetrics {
  openColumns: number
  etchedDepthNm: number
  voidCount: number
  viaLandedAreaPercent?: number
  spacerLineCentersNm?: number[]
  note?: string
}

export interface SimulationSnapshot {
  width: number
  height: number
  cellSizeNm: number
  cells: Uint8Array
  stepIndex: number
  stepName: string
  metrics: SimulationMetrics
}

export interface SerializedSimulationSnapshot extends Omit<SimulationSnapshot, 'cells'> {
  cells: number[]
}

export interface PresetDefinition {
  id: string
  title: string
  summary: string
  articleSlug: string
  document: FlowDocument
}

export function createId(prefix = 'item'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
