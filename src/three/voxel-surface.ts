import type { MaterialInstanceGeometry, VoxelSurfaceGeometry } from './worker-protocol'
import type { VolumeGrid } from './volume'

const MATRIX_COMPONENTS = 16

export interface VoxelSurfaceOptions {
  /** Worker-side budget before retrying the display geometry at a lower resolution. */
  timeBudgetMs?: number
  /** Allows the worker to skip full-resolution bulk geometry after slow 2D sampling. */
  minimumStride?: number
  /** Injectable monotonic clock for deterministic tests. */
  now?: () => number
}

interface MatrixBuckets {
  [materialCode: number]: number[]
}

interface BulkAttempt {
  matrices: MatrixBuckets
  timedOut: boolean
}

function clockNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function cellAt(volume: VolumeGrid, x: number, y: number, z: number): number {
  return volume.cells[z * volume.width * volume.height + y * volume.width + x]
}

function pushMatrix(
  bucket: number[],
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  // three.js matrices are column-major. The base BoxGeometry has unit dimensions.
  bucket.push(
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1,
  )
}

function bucketFor(buckets: MatrixBuckets, materialCode: number): number[] {
  return (buckets[materialCode] ??= [])
}

function voxelTransform(
  volume: VolumeGrid,
  x: number,
  y: number,
  z: number,
  spanX = 1,
  spanY = 1,
  spanZ = 1,
): [number, number, number, number, number, number] {
  const cell = volume.cellSizeNm
  const tx = (x + spanX / 2 - volume.width / 2) * cell
  // Engine rows start at the top; three.js Y points upward.
  const ty = (volume.height / 2 - y - spanY / 2) * cell
  const tz = (z + spanZ / 2 - volume.depth / 2) * cell
  return [tx, ty, tz, spanX * cell, spanY * cell, spanZ * cell]
}

function isExposed(
  volume: VolumeGrid,
  x: number,
  y: number,
  z: number,
  materialCode: number,
  visibleLastSlice: number,
  stride: number,
): boolean {
  const neighbors: ReadonlyArray<readonly [number, number, number]> = [
    [x - stride, y, z],
    [x + stride, y, z],
    [x, y - stride, z],
    [x, y + stride, z],
    [x, y, z - stride],
    [x, y, z + stride],
  ]

  for (const [nx, ny, nz] of neighbors) {
    if (
      nx < 0 || nx >= volume.width ||
      ny < 0 || ny >= volume.height ||
      nz < 0 || nz > visibleLastSlice
    ) {
      return true
    }
    // Material interfaces are retained so hiding an outer material can reveal them.
    if (cellAt(volume, nx, ny, nz) !== materialCode) return true
  }
  return false
}

function representativeCode(
  volume: VolumeGrid,
  x: number,
  y: number,
  z: number,
  spanX: number,
  spanY: number,
  spanZ: number,
): number {
  const xs = spanX === 1 ? [x] : [x, x + spanX - 1, x + Math.floor(spanX / 2)]
  const ys = spanY === 1 ? [y] : [y, y + spanY - 1, y + Math.floor(spanY / 2)]
  const zs = spanZ === 1 ? [z] : [z, z + spanZ - 1, z + Math.floor(spanZ / 2)]
  const counts = new Map<number, number>()

  for (const sampleZ of zs) {
    for (const sampleY of ys) {
      for (const sampleX of xs) {
        const code = cellAt(volume, sampleX, sampleY, sampleZ)
        if (code === 0) continue
        counts.set(code, (counts.get(code) ?? 0) + 1)
      }
    }
  }

  let selected = 0
  let selectedCount = 0
  for (const [code, count] of counts) {
    if (count > selectedCount || (count === selectedCount && code < selected)) {
      selected = code
      selectedCount = count
    }
  }
  return selected
}

function buildExactCap(
  volume: VolumeGrid,
  cutSliceIndex: number,
): { matrices: MatrixBuckets; counts: Map<number, number> } {
  const matrices: MatrixBuckets = {}
  const counts = new Map<number, number>()

  for (let y = 0; y < volume.height; y += 1) {
    for (let x = 0; x < volume.width; x += 1) {
      const materialCode = cellAt(volume, x, y, cutSliceIndex)
      if (materialCode === 0) continue
      counts.set(materialCode, (counts.get(materialCode) ?? 0) + 1)
      pushMatrix(bucketFor(matrices, materialCode), ...voxelTransform(volume, x, y, cutSliceIndex))
    }
  }

  return { matrices, counts }
}

function countSourceVoxels(volume: VolumeGrid, cutSliceIndex: number): Map<number, number> {
  const counts = new Map<number, number>()
  const sliceSize = volume.width * volume.height
  const visibleCellCount = (cutSliceIndex + 1) * sliceSize
  for (let index = 0; index < visibleCellCount; index += 1) {
    const code = volume.cells[index]
    if (code === 0) continue
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return counts
}

function buildBulk(
  volume: VolumeGrid,
  cutSliceIndex: number,
  stride: number,
  deadline: number,
  now: () => number,
): BulkAttempt {
  const matrices: MatrixBuckets = {}
  let visited = 0

  // The cap is emitted separately at full resolution, so bulk stops before it.
  for (let z = 0; z < cutSliceIndex; z += stride) {
    const spanZ = Math.min(stride, cutSliceIndex - z)
    for (let y = 0; y < volume.height; y += stride) {
      const spanY = Math.min(stride, volume.height - y)
      for (let x = 0; x < volume.width; x += stride) {
        const spanX = Math.min(stride, volume.width - x)
        const code = stride === 1
          ? cellAt(volume, x, y, z)
          : representativeCode(volume, x, y, z, spanX, spanY, spanZ)

        if (
          code !== 0 &&
          isExposed(
            volume,
            Math.min(volume.width - 1, x + Math.floor(spanX / 2)),
            Math.min(volume.height - 1, y + Math.floor(spanY / 2)),
            Math.min(cutSliceIndex, z + Math.floor(spanZ / 2)),
            code,
            cutSliceIndex,
            stride,
          )
        ) {
          pushMatrix(
            bucketFor(matrices, code),
            ...voxelTransform(volume, x, y, z, spanX, spanY, spanZ),
          )
        }

        visited += 1
        if ((visited & 0x7ff) === 0 && now() > deadline) {
          return { matrices: {}, timedOut: true }
        }
      }
    }
  }
  return { matrices, timedOut: false }
}

function combineMatrices(
  cap: MatrixBuckets,
  bulk: MatrixBuckets,
  sourceCounts: Map<number, number>,
  capCounts: Map<number, number>,
): MaterialInstanceGeometry[] {
  const materialCodes = new Set<number>([
    ...Object.keys(cap).map(Number),
    ...Object.keys(bulk).map(Number),
  ])

  return [...materialCodes]
    .sort((a, b) => a - b)
    .map((materialCode) => {
      const capMatrices = cap[materialCode] ?? []
      const bulkMatrices = bulk[materialCode] ?? []
      const matrices = new Float32Array(capMatrices.length + bulkMatrices.length)
      matrices.set(capMatrices)
      matrices.set(bulkMatrices, capMatrices.length)
      return {
        materialCode,
        instanceCount: matrices.length / MATRIX_COMPONENTS,
        sourceVoxelCount: sourceCounts.get(materialCode) ?? 0,
        capVoxelCount: capCounts.get(materialCode) ?? 0,
        matrices,
      }
    })
}

/**
 * Build exposed voxel transforms for rendering. Only the cut cap is always full
 * resolution; display-only bulk geometry retries at increasing strides when it
 * exceeds the worker budget.
 */
export function buildVoxelSurface(
  volume: VolumeGrid,
  options: VoxelSurfaceOptions = {},
): VoxelSurfaceGeometry {
  const now = options.now ?? clockNow
  const budget = Math.max(0, options.timeBudgetMs ?? 2_000)
  const cutSliceIndex = Math.min(volume.depth - 1, Math.max(0, volume.cutSliceIndex))
  const cap = buildExactCap(volume, cutSliceIndex)
  const sourceCounts = countSourceVoxels(volume, cutSliceIndex)
  const maxStride = Math.max(volume.width, volume.height, Math.max(1, cutSliceIndex))
  let stride = Math.max(1, Math.floor(options.minimumStride ?? 1))
  let bulk: BulkAttempt

  for (;;) {
    const deadline = stride >= maxStride || !Number.isFinite(budget)
      ? Number.POSITIVE_INFINITY
      : now() + budget
    bulk = buildBulk(volume, cutSliceIndex, stride, deadline, now)
    if (!bulk.timedOut) break
    stride = Math.min(maxStride, stride * 2)
  }

  return {
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
    cellSizeNm: volume.cellSizeNm,
    cutPosition: volume.cutPosition,
    cutSliceIndex,
    cutPlaneZNm: (cutSliceIndex + 1 - volume.depth / 2) * volume.cellSizeNm,
    throughStep: volume.throughStep,
    stepIndex: volume.stepIndex,
    stepName: volume.stepName,
    stride,
    downsampled: stride > 1,
    materials: combineMatrices(cap.matrices, bulk.matrices, sourceCounts, cap.counts),
  }
}

export function surfaceMaterialCounts(
  geometry: VoxelSurfaceGeometry,
): Map<number, { instances: number; sourceVoxels: number; capVoxels: number }> {
  return new Map(
    geometry.materials.map((material) => [
      material.materialCode,
      {
        instances: material.instanceCount,
        sourceVoxels: material.sourceVoxelCount,
        capVoxels: material.capVoxelCount,
      },
    ]),
  )
}
