import type { FlowDocument } from '../domain/flow'

export interface VolumeWorkerBuildRequest {
  type: 'build-volume'
  generationId: number
  document: FlowDocument
  cutPosition: number
  throughStep?: number
}

export interface MaterialInstanceGeometry {
  materialCode: number
  /** Number of display instances in `matrices`. */
  instanceCount: number
  /** Exact occupied voxel count on the retained side of the cut. */
  sourceVoxelCount: number
  /** Exact full-resolution voxel count on the cut cap. */
  capVoxelCount: number
  /** Column-major 4x4 instance transforms, ready for an InstancedBufferAttribute. */
  matrices: Float32Array
}

export interface VoxelSurfaceGeometry {
  width: number
  height: number
  depth: number
  cellSizeNm: number
  cutPosition: number
  cutSliceIndex: number
  cutPlaneZNm: number
  throughStep: number
  stepIndex: number
  stepName: string
  stride: number
  downsampled: boolean
  materials: MaterialInstanceGeometry[]
}

export interface VolumeWorkerBuildSuccess {
  type: 'volume-built'
  generationId: number
  geometry: VoxelSurfaceGeometry
  elapsedMs: number
  samplingElapsedMs: number
  geometryElapsedMs: number
}

export interface VolumeWorkerBuildFailure {
  type: 'volume-error'
  generationId: number
  message: string
}

export type VolumeWorkerRequest = VolumeWorkerBuildRequest
export type VolumeWorkerResponse = VolumeWorkerBuildSuccess | VolumeWorkerBuildFailure
