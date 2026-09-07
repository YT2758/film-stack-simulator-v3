import type { FlowDocument, LayoutRole, Point2D } from '../domain/flow'

export const ETCH_LAYOUT_ROLES: readonly LayoutRole[] = ['opening', 'via']

export interface LayoutMaskOptions {
  roles?: readonly LayoutRole[]
  /** Positive values move the sampled feature toward increasing X. */
  overlayNm?: number
}

function isPointOnSegment(point: Point2D, start: Point2D, end: Point2D): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y)
  if (Math.abs(cross) > 1e-12) return false
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)
  if (dot < 0) return false
  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2
  return dot <= squaredLength
}

/** Even-odd polygon test with boundary points treated as inside. */
export function pointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]
    const b = polygon[previous]
    if (isPointOnSegment(point, a, b)) return true
    const crosses = (a.y > point.y) !== (b.y > point.y)
    if (!crosses) continue
    const xAtY = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (point.x < xAtY) inside = !inside
  }
  return inside
}

export function normalizedOverlayX(document: FlowDocument, overlayNm: number): number {
  const crossSectionWidthNm = document.grid.width * document.grid.cellSizeNm
  return crossSectionWidthNm > 0 ? overlayNm / crossSectionWidthNm : 0
}

/**
 * Sample visible layout polygons where the normalized top-down cut line meets
 * the cross-section. The return value has one byte per cross-section column.
 */
export function sampleLayoutMask(
  document: FlowDocument,
  cutPosition = document.layout.cutPosition,
  options: LayoutMaskOptions = {},
): Uint8Array {
  const width = document.grid.width
  const mask = new Uint8Array(width)
  const roles = new Set(options.roles ?? ETCH_LAYOUT_ROLES)
  const offsetX = normalizedOverlayX(document, options.overlayNm ?? 0)
  const cutY = Math.max(0, Math.min(1, Number.isFinite(cutPosition) ? cutPosition : document.layout.cutPosition))
  const features = document.layout.features.filter(
    (feature) => feature.visible && roles.has(feature.role) && feature.points.length >= 3,
  )

  for (let x = 0; x < width; x += 1) {
    // Query the unshifted polygon at x - offset so a positive overlay moves it right.
    const point = { x: (x + 0.5) / width - offsetX, y: cutY }
    if (features.some((feature) => pointInPolygon(point, feature.points))) mask[x] = 1
  }
  return mask
}

export interface PolygonRasterOptions {
  roles: readonly LayoutRole[]
  offsetXNormalized?: number
}

/** Rasterize top-down polygons on the document's width × depthSlices lattice. */
export function rasterizeTopDown(document: FlowDocument, options: PolygonRasterOptions): Uint8Array {
  const width = document.grid.width
  const depth = document.grid.depthSlices
  if (!Number.isInteger(depth) || depth <= 0) {
    throw new RangeError('grid.depthSlices must be a positive integer')
  }
  const roles = new Set(options.roles)
  const offsetX = options.offsetXNormalized ?? 0
  const features = document.layout.features.filter(
    (feature) => feature.visible && roles.has(feature.role) && feature.points.length >= 3,
  )
  const result = new Uint8Array(width * depth)
  for (let y = 0; y < depth; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = { x: (x + 0.5) / width - offsetX, y: (y + 0.5) / depth }
      if (features.some((feature) => pointInPolygon(point, feature.points))) {
        result[y * width + x] = 1
      }
    }
  }
  return result
}

/**
 * Compute the top-down fraction of shifted via area that overlaps visible metal
 * polygons. Undefined means the layout has no rasterized via area.
 */
export interface ViaLandedAreaMeasurement {
  percent?: number
  nominalCells: number
  landedCells: number
  shiftedIndices: number[]
  landedIndices: number[]
}

export function measureViaLandedArea(document: FlowDocument, overlayNm = 0): ViaLandedAreaMeasurement {
  const offsetX = normalizedOverlayX(document, overlayNm)
  const nominalVia = rasterizeTopDown(document, { roles: ['via'] })
  const shiftedVia = rasterizeTopDown(document, { roles: ['via'], offsetXNormalized: offsetX })
  const metal = rasterizeTopDown(document, { roles: ['metal'] })
  let viaArea = 0
  let landedArea = 0
  const shiftedIndices: number[] = []
  const landedIndices: number[] = []
  for (let index = 0; index < nominalVia.length; index += 1) {
    if (nominalVia[index] !== 0) viaArea += 1
    if (shiftedVia[index] !== 0) shiftedIndices.push(index)
    if (shiftedVia[index] !== 0 && metal[index] !== 0) {
      landedArea += 1
      landedIndices.push(index)
    }
  }
  return {
    percent: viaArea === 0 ? undefined : (landedArea / viaArea) * 100,
    nominalCells: viaArea,
    landedCells: landedArea,
    shiftedIndices,
    landedIndices,
  }
}

export function computeViaLandedAreaPercent(document: FlowDocument, overlayNm = 0): number | undefined {
  return measureViaLandedArea(document, overlayNm).percent
}
