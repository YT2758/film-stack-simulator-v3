import type { MaterialId } from './flow'

export interface MaterialDefinition {
  id: MaterialId
  name: string
  shortName: string
  color: string
  textColor: string
}

export const MATERIALS: MaterialDefinition[] = [
  { id: 'silicon', name: 'Silicon', shortName: 'Si', color: '#5d6b7a', textColor: '#f8fafc' },
  { id: 'silicon-dioxide', name: 'Silicon dioxide', shortName: 'SiO₂', color: '#72d6c9', textColor: '#06231f' },
  { id: 'silicon-nitride', name: 'Silicon nitride', shortName: 'SiN', color: '#f0c76b', textColor: '#2a1a02' },
  { id: 'photoresist', name: 'Photoresist', shortName: 'PR', color: '#ef7d73', textColor: '#2c0705' },
  { id: 'polysilicon', name: 'Polysilicon', shortName: 'poly-Si', color: '#9b8ae5', textColor: '#110b33' },
  { id: 'tungsten', name: 'Tungsten', shortName: 'W', color: '#b8c0c8', textColor: '#12171c' },
  { id: 'copper', name: 'Copper', shortName: 'Cu', color: '#dd8c45', textColor: '#2a1102' },
  { id: 'low-k', name: 'Low-k dielectric', shortName: 'low-k', color: '#4ca8cf', textColor: '#041e2a' },
  { id: 'spacer', name: 'Spacer', shortName: 'SPC', color: '#d8f171', textColor: '#182004' },
]

export const MATERIAL_CODE: Record<MaterialId, number> = Object.fromEntries(
  MATERIALS.map((material, index) => [material.id, index + 1]),
) as Record<MaterialId, number>

export const CODE_MATERIAL = new Map<number, MaterialDefinition>(
  MATERIALS.map((material, index) => [index + 1, material]),
)

export function materialById(id: MaterialId): MaterialDefinition {
  const material = MATERIALS.find((candidate) => candidate.id === id)
  if (!material) throw new Error(`Unknown material: ${id}`)
  return material
}
