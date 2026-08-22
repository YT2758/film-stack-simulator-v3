/// <reference lib="webworker" />

import type {
  VolumeWorkerBuildFailure,
  VolumeWorkerBuildSuccess,
  VolumeWorkerRequest,
} from './worker-protocol'
import { sampleVolume } from './volume'
import { buildVoxelSurface } from './voxel-surface'

const workerScope = self as DedicatedWorkerGlobalScope
const PERFORMANCE_BUDGET_MS = 2_000

function now(): number {
  return performance.now()
}

workerScope.addEventListener('message', (event: MessageEvent<VolumeWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'build-volume') return

  const startedAt = now()
  try {
    // postMessage structured-clones the document. The worker cannot mutate React state.
    const volume = sampleVolume(request.document, {
      cutPosition: request.cutPosition,
      throughStep: request.throughStep,
    })
    const sampledAt = now()
    const samplingElapsedMs = sampledAt - startedAt
    const minimumStride = samplingElapsedMs > PERFORMANCE_BUDGET_MS ? 2 : 1
    const remainingBudgetMs = Math.max(0, PERFORMANCE_BUDGET_MS - samplingElapsedMs)
    const geometry = buildVoxelSurface(volume, {
      minimumStride,
      timeBudgetMs: remainingBudgetMs,
    })
    const finishedAt = now()
    const response: VolumeWorkerBuildSuccess = {
      type: 'volume-built',
      generationId: request.generationId,
      geometry,
      elapsedMs: finishedAt - startedAt,
      samplingElapsedMs,
      geometryElapsedMs: finishedAt - sampledAt,
    }
    const transfers = geometry.materials.map((material) => material.matrices.buffer)
    workerScope.postMessage(response, transfers)
  } catch (error) {
    const response: VolumeWorkerBuildFailure = {
      type: 'volume-error',
      generationId: request.generationId,
      message: error instanceof Error ? error.message : String(error),
    }
    workerScope.postMessage(response)
  }
})

export {}
