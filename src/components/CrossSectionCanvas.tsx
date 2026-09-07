import { useEffect, useRef, useState } from 'react'
import type { DepositStep, FlowDocument, SimulationSnapshot } from '../domain/flow'
import { CODE_MATERIAL, MATERIALS } from '../domain/materials'
import { connectedMaterialRegion, inspectSnapshotCell, type MaterialCellInspection } from '../engine/selection'
import type { MetricKind } from './MetricGrid'
import { translate, type Language } from '../i18n'

interface CrossSectionCanvasProps {
  snapshot: SimulationSnapshot
  compareTo?: SimulationSnapshot
  embedded?: boolean
  document?: FlowDocument
  measurement?: MetricKind | null
  language: Language
}

const CANVAS_PAD = { left: 50, right: 18, top: 20, bottom: 38 }

function drawCrossSection(canvas: HTMLCanvasElement, snapshot: SimulationSnapshot, width: number, height: number, compareTo?: SimulationSnapshot, selection?: MaterialCellInspection | null, measurement?: MetricKind | null) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  const pad = CANVAS_PAD
  const drawWidth = Math.max(1, width - pad.left - pad.right)
  const drawHeight = Math.max(1, height - pad.top - pad.bottom)
  const cellWidth = drawWidth / snapshot.width
  const cellHeight = drawHeight / snapshot.height

  const background = context.createLinearGradient(0, pad.top, 0, pad.top + drawHeight)
  background.addColorStop(0, '#07110f')
  background.addColorStop(1, '#0b1715')
  context.fillStyle = background
  context.fillRect(pad.left, pad.top, drawWidth, drawHeight)

  for (let y = 0; y < snapshot.height; y += 1) {
    let runStart = 0
    let runCode = snapshot.cells[y * snapshot.width]
    for (let x = 1; x <= snapshot.width; x += 1) {
      const code = x < snapshot.width ? snapshot.cells[y * snapshot.width + x] : 255
      if (code !== runCode) {
        if (runCode !== 0) {
          context.fillStyle = CODE_MATERIAL.get(runCode)?.color ?? '#f43f5e'
          context.fillRect(
            pad.left + runStart * cellWidth,
            pad.top + y * cellHeight,
            Math.max(1, (x - runStart) * cellWidth + 0.2),
            Math.max(1, cellHeight + 0.2),
          )
        }
        runStart = x
        runCode = code
      }
    }
  }

  if (compareTo && compareTo.width === snapshot.width && compareTo.height === snapshot.height) {
    for (let y = 0; y < snapshot.height; y += 1) {
      for (let x = 0; x < snapshot.width; x += 1) {
        const index = y * snapshot.width + x
        const before = compareTo.cells[index]
        const after = snapshot.cells[index]
        if (before === after) continue
        context.fillStyle = before === 0
          ? 'rgba(103, 223, 201, .42)'
          : after === 0
            ? 'rgba(239, 141, 116, .48)'
            : 'rgba(241, 209, 116, .42)'
        context.fillRect(
          pad.left + x * cellWidth,
          pad.top + y * cellHeight,
          Math.max(1, cellWidth + 0.2),
          Math.max(1, cellHeight + 0.2),
        )
      }
    }
  }

  if (measurement === 'open-columns') {
    context.fillStyle = 'rgba(103, 223, 201, .10)'
    for (const x of snapshot.metrics.openColumnIndices ?? []) context.fillRect(pad.left + x * cellWidth, pad.top, cellWidth, drawHeight)
  } else if (measurement === 'etched-depth' && snapshot.metrics.etchedDepthMeasurement) {
    context.strokeStyle = '#ef8d74'
    context.lineWidth = Math.max(1, Math.min(cellWidth, cellHeight) * 0.3)
    const { column, removedRows } = snapshot.metrics.etchedDepthMeasurement
    for (const y of removedRows) context.strokeRect(pad.left + column * cellWidth, pad.top + y * cellHeight, cellWidth, cellHeight)
  } else if (measurement === 'enclosed-voids') {
    context.strokeStyle = '#f1d174'
    context.lineWidth = 2
    for (const region of snapshot.metrics.enclosedVoidRegions ?? []) {
      context.strokeRect(
        pad.left + region.minX * cellWidth,
        pad.top + region.minY * cellHeight,
        (region.maxX - region.minX + 1) * cellWidth,
        (region.maxY - region.minY + 1) * cellHeight,
      )
    }
  }

  if (selection && snapshot.cells[selection.y * snapshot.width + selection.x] === selection.materialCode) {
    const region = connectedMaterialRegion(snapshot, selection.x, selection.y)
    context.strokeStyle = 'rgba(255, 255, 255, .82)'
    context.lineWidth = Math.max(1, Math.min(cellWidth, cellHeight) * 0.18)
    for (const index of region) {
      const x = index % snapshot.width
      const y = Math.floor(index / snapshot.width)
      const neighbors = [
        [x - 1, y, 'left'], [x + 1, y, 'right'], [x, y - 1, 'top'], [x, y + 1, 'bottom'],
      ] as const
      for (const [nextX, nextY, edge] of neighbors) {
        const outside = nextX < 0 || nextX >= snapshot.width || nextY < 0 || nextY >= snapshot.height
        if (!outside && region.has(nextY * snapshot.width + nextX)) continue
        const px = pad.left + x * cellWidth
        const py = pad.top + y * cellHeight
        context.beginPath()
        if (edge === 'left' || edge === 'right') {
          const edgeX = edge === 'left' ? px : px + cellWidth
          context.moveTo(edgeX, py)
          context.lineTo(edgeX, py + cellHeight)
        } else {
          const edgeY = edge === 'top' ? py : py + cellHeight
          context.moveTo(px, edgeY)
          context.lineTo(px + cellWidth, edgeY)
        }
        context.stroke()
      }
    }
  }

  context.strokeStyle = 'rgba(147, 199, 187, .32)'
  context.lineWidth = 1
  context.strokeRect(pad.left + 0.5, pad.top + 0.5, drawWidth - 1, drawHeight - 1)

  const majorNm = snapshot.cellSizeNm * 20
  const majorCells = 20
  context.font = '11px "IBM Plex Sans Variable", sans-serif'
  context.fillStyle = '#77918b'
  context.strokeStyle = 'rgba(119, 145, 139, .25)'
  context.textAlign = 'center'
  for (let x = 0; x <= snapshot.width; x += majorCells) {
    const px = pad.left + x * cellWidth
    context.beginPath()
    context.moveTo(px, pad.top + drawHeight)
    context.lineTo(px, pad.top + drawHeight + 5)
    context.stroke()
    context.fillText(`${x * snapshot.cellSizeNm}`, px, pad.top + drawHeight + 20)
  }
  context.textAlign = 'right'
  context.fillText('nm', pad.left - 11, pad.top + 4)
  for (let y = 0; y <= snapshot.height; y += majorCells) {
    const py = pad.top + drawHeight - y * cellHeight
    context.fillText(`${y * snapshot.cellSizeNm}`, pad.left - 10, py + 4)
  }

  const scaleWidth = Math.min(drawWidth * 0.28, (majorNm / snapshot.cellSizeNm) * cellWidth)
  context.fillStyle = '#d4eee8'
  context.fillRect(pad.left + drawWidth - scaleWidth - 12, pad.top + 14, scaleWidth, 2)
  context.textAlign = 'center'
  context.font = '600 10px "IBM Plex Sans Variable", sans-serif'
  context.fillText(`${majorNm} nm`, pad.left + drawWidth - scaleWidth / 2 - 12, pad.top + 11)
}

export function CrossSectionCanvas({ snapshot, compareTo, embedded = false, document, measurement, language }: CrossSectionCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 720, height: 480 })
  const [selection, setSelection] = useState<MaterialCellInspection | null>(null)
  const resolvedSelection = selection ? inspectSnapshotCell(snapshot, selection.x, selection.y) : null

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect
      setSize({ width: Math.max(320, next.width), height: Math.max(320, next.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (canvasRef.current) drawCrossSection(canvasRef.current, snapshot, size.width, size.height, compareTo, resolvedSelection, measurement)
    if (selection && !resolvedSelection) setSelection(null)
  }, [compareTo, measurement, selection, size, snapshot])

  const presentCodes = new Set(snapshot.cells)
  let addedCells = 0
  let removedCells = 0
  let replacedCells = 0
  if (compareTo && compareTo.cells.length === snapshot.cells.length) {
    for (let index = 0; index < snapshot.cells.length; index += 1) {
      const before = compareTo.cells[index]
      const after = snapshot.cells[index]
      if (before === after) continue
      if (before === 0) addedCells += 1
      else if (after === 0) removedCells += 1
      else replacedCells += 1
    }
  }
  const selectedMaterial = resolvedSelection ? CODE_MATERIAL.get(resolvedSelection.materialCode) : undefined
  const startingThicknessNm = selectedMaterial && document
    ? document.baseLayers.filter((layer) => layer.material === selectedMaterial.id).reduce((sum, layer) => sum + layer.thicknessNm, 0)
    : 0
  const nominalDepositions = selectedMaterial && document
    ? document.steps.filter((step): step is DepositStep => step.type === 'deposit' && step.material === selectedMaterial.id)
    : []

  return (
    <div className={`cross-section-wrap ${embedded ? 'embedded' : ''}`} ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        aria-label={translate(language, 'materialCrossSection', { step: snapshot.stepName })}
        onClick={(event) => {
          const canvas = event.currentTarget
          const bounds = canvas.getBoundingClientRect()
          const drawWidth = Math.max(1, bounds.width - CANVAS_PAD.left - CANVAS_PAD.right)
          const drawHeight = Math.max(1, bounds.height - CANVAS_PAD.top - CANVAS_PAD.bottom)
          const x = Math.floor((event.clientX - bounds.left - CANVAS_PAD.left) / drawWidth * snapshot.width)
          const y = Math.floor((event.clientY - bounds.top - CANVAS_PAD.top) / drawHeight * snapshot.height)
          setSelection(inspectSnapshotCell(snapshot, x, y))
        }}
      />
      <div className="material-legend" aria-label={translate(language, 'materialPalette')}>
        {MATERIALS.filter((material) => presentCodes.has(MATERIALS.indexOf(material) + 1)).map((material) => (
          <span key={material.id}><i style={{ background: material.color }} />{material.shortName}</span>
        ))}
      </div>
      <div className="canvas-coordinate-badge">{translate(language, 'gridCells', { width: snapshot.width, height: snapshot.height, size: snapshot.cellSizeNm })}</div>
      {compareTo && (
        <div className="difference-legend" aria-label={translate(language, 'cellDifferences')}>
          <span><i className="added" />{translate(language, 'added', { count: addedCells })}</span>
          <span><i className="removed" />{translate(language, 'removed', { count: removedCells })}</span>
          {replacedCells > 0 && <span><i className="replaced" />{translate(language, 'changed', { count: replacedCells })}</span>}
        </div>
      )}
      {resolvedSelection && selectedMaterial && (
        <aside className="material-inspector" aria-label={translate(language, 'selectedMaterialDetails')}>
          <button type="button" aria-label={translate(language, 'closeMaterialDetails')} onClick={() => setSelection(null)}>×</button>
          <span>{translate(language, 'selectedMaterial')}</span>
          <strong><i style={{ background: selectedMaterial.color }} />{selectedMaterial.name} ({selectedMaterial.shortName})</strong>
          <dl>
            <div><dt>{translate(language, 'location')}</dt><dd>{translate(language, 'locationValue', { x: resolvedSelection.xNm.toFixed(1), height: resolvedSelection.heightNm.toFixed(1) })}</dd></div>
            <div><dt>{translate(language, 'localRemaining')}</dt><dd>{translate(language, 'localRemainingValue', { value: resolvedSelection.localVerticalThicknessNm })}</dd></div>
            <div><dt>{translate(language, 'startingDefinition')}</dt><dd>{startingThicknessNm > 0 ? translate(language, 'startingDefinitionValue', { value: startingThicknessNm }) : translate(language, 'notStartingStack')}</dd></div>
            <div><dt>{translate(language, 'nominalDeposition')}</dt><dd>{nominalDepositions.length > 0 ? nominalDepositions.map((step) => `${step.name}: ${step.thicknessNm} nm`).join(' · ') : translate(language, 'noDeposition')}</dd></div>
          </dl>
          <p>{translate(language, 'provenanceUnavailable')}</p>
        </aside>
      )}
    </div>
  )
}
