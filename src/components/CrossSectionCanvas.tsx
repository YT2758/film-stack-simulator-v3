import { useEffect, useRef, useState } from 'react'
import type { SimulationSnapshot } from '../domain/flow'
import { CODE_MATERIAL, MATERIALS } from '../domain/materials'

interface CrossSectionCanvasProps {
  snapshot: SimulationSnapshot
}

function drawCrossSection(canvas: HTMLCanvasElement, snapshot: SimulationSnapshot, width: number, height: number) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  const pad = { left: 50, right: 18, top: 20, bottom: 38 }
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

export function CrossSectionCanvas({ snapshot }: CrossSectionCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 720, height: 480 })

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
    if (canvasRef.current) drawCrossSection(canvasRef.current, snapshot, size.width, size.height)
  }, [size, snapshot])

  const presentCodes = new Set(snapshot.cells)

  return (
    <div className="cross-section-wrap" ref={wrapperRef}>
      <canvas ref={canvasRef} aria-label={`Material cross-section after ${snapshot.stepName}`} />
      <div className="material-legend" aria-label="Material palette">
        {MATERIALS.filter((material) => presentCodes.has(MATERIALS.indexOf(material) + 1)).map((material) => (
          <span key={material.id}><i style={{ background: material.color }} />{material.shortName}</span>
        ))}
      </div>
      <div className="canvas-coordinate-badge">{snapshot.width} × {snapshot.height} cells · {snapshot.cellSizeNm} nm/cell</div>
    </div>
  )
}
