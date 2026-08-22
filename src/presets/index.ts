import type { FlowDocument, PresetDefinition } from '../domain/flow'
import ardeDemoJson from './arde-demo.json'
import borderlessViaMarginJson from './borderless-via-margin.json'
import sadpPitchWalkingJson from './sadp-pitch-walking.json'

export type { PresetDefinition } from '../domain/flow'

const ardeDemo = ardeDemoJson as FlowDocument
const sadpPitchWalking = sadpPitchWalkingJson as FlowDocument
const borderlessViaMargin = borderlessViaMarginJson as FlowDocument

export const PRESETS: PresetDefinition[] = [
  {
    id: 'arde-demo',
    title: 'ARDE — why deep openings etch slower',
    summary: 'Compare narrow and wide openings under one nominal directional etch.',
    articleSlug: 'arde-deep-etch-slower',
    document: ardeDemo,
  },
  {
    id: 'sadp-pitch-walking',
    title: 'SADP pitch walking',
    summary: 'See how spacer edge displacement turns one mandrel pitch into alternating line spaces.',
    articleSlug: 'sadp-pitch-walking',
    document: sadpPitchWalking,
  },
  {
    id: 'borderless-via-margin',
    title: 'Borderless via overlay margin',
    summary: 'Measure the landed via area remaining after a deliberate overlay shift.',
    articleSlug: 'borderless-via-overlay-margin',
    document: borderlessViaMargin,
  },
]

export function getPresetById(id: string): PresetDefinition | undefined {
  return PRESETS.find((preset) => preset.id === id)
}
