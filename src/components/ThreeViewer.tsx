import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { FlowDocument } from '../domain/flow'
import { CODE_MATERIAL } from '../domain/materials'
import type {
  VolumeWorkerBuildRequest,
  VolumeWorkerResponse,
  VoxelSurfaceGeometry,
} from '../three/worker-protocol'
import {
  createMaterialVisibilityState,
  reconcileMaterialVisibility,
  toggleMaterialVisibility,
} from '../three/material-visibility'
import { translate, type Language } from '../i18n'

export interface ThreeViewerProps {
  document: FlowDocument
  language: Language
  /** Zero-based inclusive step rendered in 3D. -1 renders the base stack. */
  throughStep?: number
  /** Optional UI synchronizer; the worker itself never receives a state mutator. */
  onCutPositionChange?: (cutPosition: number) => void
  /** Leaves all flow state intact and returns to the authoritative 2D view. */
  onReturnTo2D?: () => void
  className?: string
  style?: CSSProperties
}

interface ViewerRuntime {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  materialGroup: THREE.Group
  animationFrame: number
  resizeObserver: ResizeObserver
  contextLost: boolean
}

interface MaterialSummary {
  code: number
  instances: number
  voxels: number
  capVoxels: number
}

type ViewerStatus =
  | { state: 'idle'; message: string }
  | { state: 'renderer-ready'; message: string }
  | { state: 'working'; message: string }
  | { state: 'ready'; message: string; downsampled: boolean }
  | { state: 'error'; message: string; canRetry: boolean }

const panelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  padding: '0.85rem',
  border: '1px solid #334155',
  borderRadius: '0.75rem',
  background: '#0f172a',
  color: '#e2e8f0',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.75rem 1rem',
}

const buttonStyle: CSSProperties = {
  border: '1px solid #64748b',
  borderRadius: '0.4rem',
  padding: '0.45rem 0.7rem',
  color: '#f8fafc',
  background: '#1e293b',
  cursor: 'pointer',
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5))
}

function disposeMaterialGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  for (const child of group.children) {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of meshMaterials) {
      if (material) materials.add(material)
    }
  }
  group.clear()
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
}

function fitCamera(runtime: ViewerRuntime, geometry: VoxelSurfaceGeometry): void {
  const width = geometry.width * geometry.cellSizeNm
  const height = geometry.height * geometry.cellSizeNm
  const depth = geometry.depth * geometry.cellSizeNm
  const radius = Math.max(width, height, depth, 1)
  const visibleCenterZ = (-depth / 2 + geometry.cutPlaneZNm) / 2
  runtime.camera.near = Math.max(0.01, radius / 1_000)
  runtime.camera.far = radius * 20
  runtime.camera.position.set(radius * 1.05, radius * 0.72, visibleCenterZ + radius * 1.25)
  runtime.camera.updateProjectionMatrix()
  runtime.controls.target.set(0, 0, visibleCenterZ)
  runtime.controls.update()
}

function installGeometry(
  runtime: ViewerRuntime,
  geometry: VoxelSurfaceGeometry,
  visibleCodes: ReadonlySet<number>,
): MaterialSummary[] {
  disposeMaterialGroup(runtime.materialGroup)
  const sharedBox = new THREE.BoxGeometry(1, 1, 1)

  for (const materialGeometry of geometry.materials) {
    const definition = CODE_MATERIAL.get(materialGeometry.materialCode)
    const material = new THREE.MeshStandardMaterial({
      color: definition?.color ?? '#d1d5db',
      roughness: 0.7,
      metalness: definition?.id === 'copper' || definition?.id === 'tungsten' ? 0.45 : 0.05,
    })
    const mesh = new THREE.InstancedMesh(
      sharedBox,
      material,
      0,
    )
    // Matrices are computed entirely in the worker. Main thread only uploads them.
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(materialGeometry.matrices, 16)
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = materialGeometry.instanceCount
    mesh.name = `material-${materialGeometry.materialCode}`
    mesh.userData.materialCode = materialGeometry.materialCode
    mesh.visible = visibleCodes.has(materialGeometry.materialCode)
    mesh.frustumCulled = false
    runtime.materialGroup.add(mesh)
  }

  return geometry.materials.map((material) => ({
    code: material.materialCode,
    instances: material.instanceCount,
    voxels: material.sourceVoxelCount,
    capVoxels: material.capVoxelCount,
  }))
}

export default function ThreeViewer({
  document,
  language,
  throughStep,
  onCutPositionChange,
  onReturnTo2D,
  className,
  style,
}: ThreeViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ViewerRuntime | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const generationRef = useRef(0)
  const firstFrameRef = useRef<number | null>(null)
  const fittedDocumentRef = useRef<string | null>(null)
  const documentIdRef = useRef(document.id)
  const materialVisibilityRef = useRef(createMaterialVisibilityState(document.id))
  const [cutPosition, setCutPosition] = useState(() => clamp01(document.layout.cutPosition))
  const deferredCutPosition = useDeferredValue(cutPosition)
  const [visibleCodes, setVisibleCodes] = useState<Set<number>>(() => new Set())
  const [materials, setMaterials] = useState<MaterialSummary[]>([])
  const [status, setStatus] = useState<ViewerStatus>({
    state: 'idle',
    message: translate(language, 'preparing3d'),
  })
  const [retryToken, setRetryToken] = useState(0)
  documentIdRef.current = document.id

  useEffect(() => {
    const group = runtimeRef.current?.materialGroup
    if (!group) return
    for (const child of group.children) {
      const code = Number(child.userData.materialCode)
      child.visible = visibleCodes.has(code)
    }
  }, [visibleCodes])

  useEffect(() => {
    setCutPosition(clamp01(document.layout.cutPosition))
  }, [document.layout.cutPosition])

  useEffect(() => {
    fittedDocumentRef.current = null
    materialVisibilityRef.current = createMaterialVisibilityState(document.id)
    setVisibleCodes(new Set())
    setMaterials([])
  }, [document.id])

  useEffect(() => {
    const mount = viewportRef.current
    if (!mount) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      })
    } catch (error) {
      setStatus({
        state: 'error',
        message: translate(language, 'rendererUnavailable', { detail: error instanceof Error ? error.message : translate(language, 'webglUnavailable') }),
        canRetry: true,
      })
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor('#07111f', 1)
    renderer.domElement.setAttribute('aria-label', translate(language, 'interactive3d'))
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    mount.append(renderer.domElement)

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      const runtime = runtimeRef.current
      if (runtime) runtime.contextLost = true
      if (firstFrameRef.current !== null) cancelAnimationFrame(firstFrameRef.current)
      firstFrameRef.current = null
      setStatus({
        state: 'error',
        message: translate(language, 'contextLost'),
        canRetry: true,
      })
    }
    const handleContextRestored = () => {
      setStatus({
        state: 'error',
        message: translate(language, 'contextRestored'),
        canRetry: true,
      })
    }
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 10_000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true
    controls.enableRotate = true
    controls.enableZoom = true
    controls.screenSpacePanning = true

    scene.add(new THREE.HemisphereLight('#dbeafe', '#172554', 1.7))
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2)
    keyLight.position.set(1, 2, 2)
    scene.add(keyLight)
    const materialGroup = new THREE.Group()
    materialGroup.name = 'worker-generated-voxel-surface'
    scene.add(materialGroup)

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    const runtime: ViewerRuntime = {
      renderer,
      scene,
      camera,
      controls,
      materialGroup,
      animationFrame: 0,
      resizeObserver,
      contextLost: false,
    }
    runtimeRef.current = runtime
    setStatus({ state: 'renderer-ready', message: translate(language, 'rendererCreated') })

    const renderFrame = () => {
      if (runtime.contextLost) return
      controls.update()
      try {
        renderer.render(scene, camera)
      } catch (error) {
        runtime.contextLost = true
        setStatus({
          state: 'error',
          message: translate(language, 'renderStopped', { detail: error instanceof Error ? error.message : String(error) }),
          canRetry: true,
        })
        return
      }
      runtime.animationFrame = requestAnimationFrame(renderFrame)
    }
    renderFrame()

    return () => {
      cancelAnimationFrame(runtime.animationFrame)
      if (firstFrameRef.current !== null) cancelAnimationFrame(firstFrameRef.current)
      firstFrameRef.current = null
      resizeObserver.disconnect()
      controls.dispose()
      disposeMaterialGroup(materialGroup)
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost)
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored)
      renderer.dispose()
      if (!runtime.contextLost) renderer.forceContextLoss()
      renderer.domElement.remove()
      runtimeRef.current = null
    }
  }, [language, retryToken])

  useEffect(() => {
    const worker = new Worker(new URL('../three/volume.worker.ts', import.meta.url), {
      type: 'module',
      name: 'film-stack-volume-builder',
    })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<VolumeWorkerResponse>) => {
      const response = event.data
      if (response.generationId !== generationRef.current) return
      if (response.type === 'volume-error') {
        setStatus({ state: 'error', message: translate(language, 'geometryFailed', { detail: response.message }), canRetry: true })
        return
      }

      const nextCodes = response.geometry.materials.map((material) => material.materialCode)
      const documentKey = documentIdRef.current
      const nextVisibility = reconcileMaterialVisibility(
        materialVisibilityRef.current,
        documentKey,
        nextCodes,
      )
      materialVisibilityRef.current = nextVisibility
      setVisibleCodes(new Set(nextVisibility.visibleCodes))

      const runtime = runtimeRef.current
      if (!runtime || runtime.contextLost) {
        setStatus({
          state: 'error',
          message: translate(language, 'geometryNoRenderer'),
          canRetry: true,
        })
        return
      }

      setStatus({ state: 'working', message: translate(language, 'presentingFrame') })
      setMaterials(installGeometry(runtime, response.geometry, nextVisibility.visibleCodes))
      if (fittedDocumentRef.current !== documentKey) {
        fitCamera(runtime, response.geometry)
        fittedDocumentRef.current = documentKey
      }

      const elapsed = Math.max(0, response.elapsedMs).toFixed(0)
      try {
        runtime.renderer.render(runtime.scene, runtime.camera)
        firstFrameRef.current = requestAnimationFrame(() => {
          firstFrameRef.current = null
          if (runtimeRef.current !== runtime || runtime.contextLost) return
          setStatus({
            state: 'ready',
            downsampled: response.geometry.downsampled,
            message: translate(language, response.geometry.downsampled ? 'readyDownsampled' : 'readyFull', { elapsed }),
          })
        })
      } catch (error) {
        setStatus({
          state: 'error',
          message: translate(language, 'firstFrameFailed', { detail: error instanceof Error ? error.message : String(error) }),
          canRetry: true,
        })
      }
    }

    worker.onerror = (event) => {
      setStatus({ state: 'error', message: event.message || translate(language, 'workerStopped'), canRetry: true })
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [language])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    const generationId = generationRef.current + 1
    generationRef.current = generationId
    const request: VolumeWorkerBuildRequest = {
      type: 'build-volume',
      generationId,
      document,
      cutPosition: clamp01(deferredCutPosition),
      throughStep,
    }
    setStatus({ state: 'working', message: translate(language, 'generatingGeometry') })
    // Coalesce slider input so superseded full-volume jobs do not queue behind one another.
    const timeout = window.setTimeout(() => worker.postMessage(request), 60)
    return () => window.clearTimeout(timeout)
  }, [document, deferredCutPosition, language, throughStep, retryToken])

  const toggleMaterial = (code: number) => {
    const nextVisibility = toggleMaterialVisibility(
      materialVisibilityRef.current,
      documentIdRef.current,
      code,
    )
    materialVisibilityRef.current = nextVisibility
    setVisibleCodes(new Set(nextVisibility.visibleCodes))
  }

  const exportPng = () => {
    const runtime = runtimeRef.current
    if (!runtime || runtime.contextLost || status.state !== 'ready') return
    try {
      runtime.renderer.render(runtime.scene, runtime.camera)
    } catch (error) {
      setStatus({ state: 'error', message: translate(language, 'pngRenderFailed', { detail: error instanceof Error ? error.message : String(error) }), canRetry: true })
      return
    }
    runtime.renderer.domElement.toBlob((blob) => {
      if (!blob) {
        setStatus({ state: 'error', message: translate(language, 'pngEmpty'), canRetry: true })
        return
      }
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      const safeName = document.name.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '')
      anchor.href = url
      anchor.download = `${safeName || 'film-stack'}-3d.png`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }, 'image/png')
  }

  const sliderStep = document.grid.depthSlices > 1
    ? 1 / (document.grid.depthSlices - 1)
    : 1

  return (
    <section className={className} style={{ ...panelStyle, ...style }} aria-label={translate(language, 'threeViewLabel')}>
      <div style={toolbarStyle}>
        <label style={{ display: 'grid', gap: '0.25rem', flex: '1 1 18rem' }}>
          <span>{translate(language, 'cutPlane', { value: (cutPosition * 100).toFixed(1) })}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={sliderStep}
            value={cutPosition}
            onChange={(event) => {
              const nextCutPosition = clamp01(event.currentTarget.valueAsNumber)
              setCutPosition(nextCutPosition)
              onCutPositionChange?.(nextCutPosition)
            }}
            aria-label={translate(language, 'cutPlaneLabel')}
          />
        </label>
        <button type="button" onClick={exportPng} style={{ ...buttonStyle, opacity: status.state === 'ready' ? 1 : 0.45 }} disabled={status.state !== 'ready'}>
          {translate(language, 'exportPng')}
        </button>
      </div>

      <div
        ref={viewportRef}
        style={{ width: '100%', height: 'clamp(22rem, 58vh, 42rem)', borderRadius: '0.5rem', overflow: 'hidden' }}
      />

      <div style={toolbarStyle} aria-label={translate(language, 'materialVisibility')}>
        {materials.map((material) => {
          const definition = CODE_MATERIAL.get(material.code)
          return (
            <label key={material.code} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={visibleCodes.has(material.code)}
                onChange={() => toggleMaterial(material.code)}
              />
              <span
                aria-hidden="true"
                style={{ width: '0.8rem', height: '0.8rem', borderRadius: '0.2rem', background: definition?.color ?? '#d1d5db' }}
              />
              {definition?.name ?? translate(language, 'materialNumber', { code: material.code })}
            </label>
          )
        })}
      </div>

      <p
        role="status"
        aria-live="polite"
        style={{ margin: 0, color: status.state === 'error' ? '#fca5a5' : status.state === 'ready' && status.downsampled ? '#fde68a' : '#bfdbfe' }}
      >
        {status.message}
      </p>

      {status.state === 'error' && (
        <div style={toolbarStyle} role="group" aria-label={translate(language, 'recoveryActions')}>
          {onReturnTo2D && <button type="button" onClick={onReturnTo2D} style={buttonStyle}>{translate(language, 'return2d')}</button>}
          {status.canRetry && <button type="button" onClick={() => setRetryToken((current) => current + 1)} style={buttonStyle}>{translate(language, 'retry3d')}</button>}
        </div>
      )}

      <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5 }}>
        {translate(language, 'threeDisclaimer')}
      </p>
    </section>
  )
}
