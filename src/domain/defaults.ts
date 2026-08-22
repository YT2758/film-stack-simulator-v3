import { FLOW_SCHEMA_VERSION, nowIso, type FlowDocument } from './flow'

export function createBlankFlow(): FlowDocument {
  const timestamp = nowIso()
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: 'local-draft',
    name: 'Untitled process study',
    description: 'A local geometry study. Rename materials and dimensions before sharing.',
    units: 'nm',
    grid: { width: 112, height: 84, depthSlices: 24, cellSizeNm: 2 },
    baseLayers: [
      { id: 'base-si', name: 'Silicon substrate', material: 'silicon', thicknessNm: 44 },
      { id: 'base-lowk', name: 'Interlayer dielectric', material: 'low-k', thicknessNm: 42 },
      { id: 'base-pr', name: 'Photoresist mask', material: 'photoresist', thicknessNm: 14 },
    ],
    layout: {
      cutPosition: 0.5,
      features: [
        {
          id: 'opening-a',
          name: 'Etch opening',
          role: 'opening',
          visible: true,
          points: [
            { x: 0.34, y: 0.14 },
            { x: 0.66, y: 0.14 },
            { x: 0.66, y: 0.86 },
            { x: 0.34, y: 0.86 },
          ],
        },
      ],
    },
    steps: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
