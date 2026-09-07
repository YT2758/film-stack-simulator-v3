import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createId, type LayoutDefinition, type LayoutFeature, type LayoutRole, type Point2D, type SimulationMetrics } from '../domain/flow'
import { ParamInfo } from './ParamInfo'
import { translate, type Language } from '../i18n'

interface LayoutEditorProps {
  layout: LayoutDefinition
  language: Language
  onChange: (layout: LayoutDefinition) => void
  grid?: { width: number; depthSlices: number }
  viaMeasurement?: SimulationMetrics['viaAreaCells']
}

const ROLE_COLOR: Record<LayoutRole, string> = {
  opening: '#67dfc9',
  via: '#ef8d74',
  metal: '#e0a464',
  mandrel: '#a897ed',
  guide: '#7d938e',
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function circlePoints(centerX: number, centerY: number, radius: number, count = 20): Point2D[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return { x: clamp(centerX + Math.cos(angle) * radius), y: clamp(centerY + Math.sin(angle) * radius) }
  })
}

function createFeature(role: LayoutRole): LayoutFeature {
  const id = createId(role)
  if (role === 'via') {
    return { id, role, name: 'Via opening', visible: true, points: circlePoints(0.5, 0.5, 0.13) }
  }
  const width = role === 'metal' ? 0.26 : role === 'mandrel' ? 0.08 : 0.3
  return {
    id,
    role,
    name: role === 'opening' ? 'Etch opening' : role === 'metal' ? 'Metal landing' : role === 'mandrel' ? 'SADP mandrel' : 'Editable polygon',
    visible: true,
    points: [
      { x: 0.5 - width / 2, y: 0.16 },
      { x: 0.5 + width / 2, y: 0.2 },
      { x: 0.5 + width * 0.44, y: 0.82 },
      { x: 0.5 - width * 0.55, y: 0.78 },
    ],
  }
}

export function LayoutEditor({ layout, language, onChange, grid, viaMeasurement }: LayoutEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(layout.features[0]?.id ?? null)
  const [drag, setDrag] = useState<{ kind: 'cut' } | { kind: 'vertex'; featureId: string; vertex: number } | null>(null)

  const selected = useMemo(() => layout.features.find((feature) => feature.id === selectedId), [layout.features, selectedId])
  const landedSet = useMemo(() => new Set(viaMeasurement?.landedIndices ?? []), [viaMeasurement])
  const viaCellPath = (indices: readonly number[], landed: boolean) => {
    if (!grid) return ''
    const cellWidth = 100 / grid.width
    const cellHeight = 100 / grid.depthSlices
    return indices.filter((index) => landedSet.has(index) === landed).map((index) => {
      const x = (index % grid.width) * cellWidth
      const y = Math.floor(index / grid.width) * cellHeight
      return `M${x} ${y}h${cellWidth}v${cellHeight}h-${cellWidth}Z`
    }).join('')
  }

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>): Point2D => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0.5, y: 0.5 }
    return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) }
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const point = pointFromEvent(event)
    if (drag.kind === 'cut') {
      onChange({ ...layout, cutPosition: point.y })
      return
    }
    onChange({
      ...layout,
      features: layout.features.map((feature) => feature.id === drag.featureId
        ? { ...feature, points: feature.points.map((candidate, index) => index === drag.vertex ? point : candidate) }
        : feature),
    })
  }

  const addFeature = (role: LayoutRole) => {
    const feature = createFeature(role)
    onChange({ ...layout, features: [...layout.features, feature] })
    setSelectedId(feature.id)
  }

  const removeSelected = () => {
    if (!selectedId) return
    onChange({ ...layout, features: layout.features.filter((feature) => feature.id !== selectedId) })
    setSelectedId(null)
  }

  return (
    <div className="layout-panel">
      <div className="panel-intro">
        <span className="eyebrow">{translate(language, 'maskGeometry')}</span>
        <h2>{translate(language, 'layout')}</h2>
        <p>{translate(language, 'layoutHelp')}</p>
      </div>

      <div className="layout-tools" role="toolbar" aria-label={translate(language, 'addLayoutFeature')}>
        <button type="button" onClick={() => addFeature('opening')}>+ {translate(language, 'opening')}</button>
        <button type="button" onClick={() => addFeature('via')}>+ {translate(language, 'via')}</button>
        <button type="button" onClick={() => addFeature('metal')}>+ {translate(language, 'metal')}</button>
        <button type="button" onClick={() => addFeature('mandrel')}>+ {translate(language, 'mandrel')}</button>
        <button type="button" onClick={() => addFeature('guide')}>+ {translate(language, 'polygon')}</button>
      </div>

      <div className="layout-canvas-shell">
        <svg
          ref={svgRef}
          className="layout-canvas"
          viewBox="0 0 100 100"
          role="img"
          aria-label={translate(language, 'editableLayout')}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <defs>
            <pattern id="layout-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(129,164,155,.14)" strokeWidth=".35" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="#081411" />
          <rect width="100" height="100" fill="url(#layout-grid)" />
          {layout.features.map((feature) => feature.visible && (
            <g key={feature.id} onPointerDown={() => setSelectedId(feature.id)}>
              <polygon
                points={feature.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
                fill={`${ROLE_COLOR[feature.role]}33`}
                stroke={ROLE_COLOR[feature.role]}
                strokeWidth={feature.id === selectedId ? 1.3 : 0.75}
                vectorEffect="non-scaling-stroke"
              />
              {feature.id === selectedId && feature.points.map((point, index) => (
                <circle
                  key={`${feature.id}-${index}`}
                  cx={point.x * 100}
                  cy={point.y * 100}
                  r="1.8"
                  fill="#e8fff9"
                  stroke="#153b34"
                  strokeWidth=".6"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setDrag({ kind: 'vertex', featureId: feature.id, vertex: index })
                  }}
                />
              ))}
            </g>
          ))}
          {grid && viaMeasurement && (
            <g aria-label={translate(language, 'viaOverlay')} pointerEvents="none">
              <path d={viaCellPath(viaMeasurement.shiftedIndices, false)} fill="rgba(239,141,116,.58)" />
              <path d={viaCellPath(viaMeasurement.shiftedIndices, true)} fill="rgba(103,223,201,.72)" />
            </g>
          )}
          <g
            className="cut-line-group"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setDrag({ kind: 'cut' })
            }}
          >
            <line x1="0" x2="100" y1={layout.cutPosition * 100} y2={layout.cutPosition * 100} stroke="#f4d97a" strokeWidth="1" strokeDasharray="3 2" />
            <rect x="0" y={layout.cutPosition * 100 - 3} width="100" height="6" fill="transparent" />
            <path d={`M 2 ${layout.cutPosition * 100 - 2} L 6 ${layout.cutPosition * 100} L 2 ${layout.cutPosition * 100 + 2} Z`} fill="#f4d97a" />
          </g>
        </svg>
        <div className="layout-axis axis-x">X</div>
        <div className="layout-axis axis-y">Y</div>
      </div>
      {viaMeasurement && (
        <div className="layout-measurement-note"><span><i className="landed" />{translate(language, 'landed')}</span><span><i className="unlanded" />{translate(language, 'unlanded')}</span><strong>{translate(language, 'nominalViaCells', { landed: viaMeasurement.landed, nominal: viaMeasurement.nominal })}</strong></div>
      )}

      <ParamInfo docId="layout.cutPosition" label={translate(language, 'crossSectionCut')} language={language} valueText={`${Math.round(layout.cutPosition * 100)}%`}>
        <input
          aria-label={translate(language, 'crossSectionCutPosition')}
          type="range"
          min="0"
          max="1"
          step="0.005"
          value={layout.cutPosition}
          onChange={(event) => onChange({ ...layout, cutPosition: Number(event.target.value) })}
        />
      </ParamInfo>

      <div className="feature-list">
        {layout.features.map((feature) => (
          <button
            type="button"
            key={feature.id}
            className={feature.id === selectedId ? 'selected' : ''}
            onClick={() => setSelectedId(feature.id)}
          >
            <i style={{ background: ROLE_COLOR[feature.role] }} />
            <span>{feature.name}<small>{translate(language, 'vertices', { role: feature.role, count: feature.points.length })}</small></span>
            <em>{translate(language, feature.visible ? 'on' : 'off')}</em>
          </button>
        ))}
      </div>

      {selected && (
        <div className="selected-feature-editor">
          <input
            aria-label={translate(language, 'selectedFeatureName')}
            value={selected.name}
            onChange={(event) => onChange({ ...layout, features: layout.features.map((feature) => feature.id === selected.id ? { ...feature, name: event.target.value } : feature) })}
          />
          <button type="button" className="subtle-button" onClick={() => onChange({ ...layout, features: layout.features.map((feature) => feature.id === selected.id ? { ...feature, visible: !feature.visible } : feature) })}>
            {translate(language, selected.visible ? 'hide' : 'show')}
          </button>
          <button type="button" className="danger-button" onClick={removeSelected}>{translate(language, 'delete')}</button>
        </div>
      )}
    </div>
  )
}
