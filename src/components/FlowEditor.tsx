import { useEffect, useId, useState } from 'react'
import { createId, type BaseLayer, type FlowDocument, type LayoutDefinition, type MaterialId, type ProcessStep, type SadpStep } from '../domain/flow'
import { MATERIALS } from '../domain/materials'
import { ParamInfo } from './ParamInfo'
import { translate, type Language } from '../i18n'

interface FlowEditorProps {
  document: FlowDocument
  language: Language
  selectedStepId: string | null
  previewStepId: string | null
  onSelectedStepChange: (id: string | null) => void
  onPreviewStepChange: (id: string | null) => void
  onChange: (document: FlowDocument) => void
}

const STEP_LABEL: Record<ProcessStep['type'], { kicker: string; color: string }> = {
  deposit: { kicker: 'DEP', color: '#67dfc9' },
  etch: { kicker: 'ETCH', color: '#ef8d74' },
  sadp: { kicker: 'SADP', color: '#d8f171' },
  planarize: { kicker: 'CMP', color: '#a897ed' },
}

function MaterialSelect({ value, onChange }: { value: MaterialId; onChange: (value: MaterialId) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as MaterialId)}>
      {MATERIALS.map((material) => <option value={material.id} key={material.id}>{material.name}</option>)}
    </select>
  )
}

function NumberControl({
  value, min, max, step, onChange, label, unit, gridCellSizeNm, language,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  label: string
  unit?: string
  gridCellSizeNm?: number
  language: Language
}) {
  const messageId = useId()
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [focused, value])

  const suffix = unit ? ` ${unit}` : ''
  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setMessage(translate(language, 'finiteRange', { min, max, unit: suffix }))
      return
    }
    const clamped = Math.max(min, Math.min(max, parsed))
    const stepped = Math.max(min, Math.min(max, min + Math.round((clamped - min) / step) * step))
    const normalized = Number(stepped.toFixed(10))
    setDraft(String(normalized))
    if (parsed < min || parsed > max) {
      setMessage(translate(language, 'adjustedRange', { value: normalized, min, max, unit: suffix }))
    } else if (Math.abs(normalized - parsed) > 1e-9) {
      setMessage(translate(language, 'adjustedStep', { value: normalized, step, unit: suffix }))
    } else {
      setMessage(null)
    }
    if (normalized !== value) onChange(normalized)
  }

  const rangeValue = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min
  return (
    <div className="number-control-wrap">
      <div className="number-control">
        <input aria-label={label} type="range" value={rangeValue} min={min} max={max} step={step} onChange={(event) => { setMessage(null); onChange(event.currentTarget.valueAsNumber) }} />
        <input
          aria-label={translate(language, 'numericValue', { label })}
          aria-describedby={message || (unit === 'nm' && gridCellSizeNm) ? messageId : undefined}
          aria-invalid={message ? 'true' : undefined}
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={() => setFocused(true)}
          onChange={(event) => { setDraft(event.target.value); setMessage(null) }}
          onBlur={() => { setFocused(false); commit() }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') { setDraft(String(value)); setMessage(null); event.currentTarget.blur() }
          }}
        />
      </div>
      {(message || (unit === 'nm' && gridCellSizeNm)) && (
        <small id={messageId} className={message ? 'number-message error' : 'number-message'}>
          {message ?? translate(language, 'gridResolution', { size: gridCellSizeNm ?? '' })}
        </small>
      )}
    </div>
  )
}

function StepEditor({ step, gridCellSizeNm, language, onChange }: { step: ProcessStep; gridCellSizeNm: number; language: Language; onChange: (step: ProcessStep) => void }) {
  if (step.type === 'deposit') {
    return (
      <div className="step-editor">
        <ParamInfo docId="deposition.mode" label={translate(language, 'depositionProfile')} language={language}>
          <div className="segmented-control three-options">
            {(['conformal', 'directional', 'gapfill'] as const).map((mode) => (
              <button type="button" className={step.mode === mode ? 'active' : ''} key={mode} onClick={() => onChange({ ...step, mode })}>{translate(language, mode === 'gapfill' ? 'gapfill' : mode)}</button>
            ))}
          </div>
        </ParamInfo>
        <ParamInfo docId="deposition.material" label={translate(language, 'filmMaterial')} language={language}>
          <MaterialSelect value={step.material} onChange={(material) => onChange({ ...step, material })} />
        </ParamInfo>
        <ParamInfo docId="deposition.thicknessNm" label={translate(language, 'nominalThickness')} language={language} valueText={`${step.thicknessNm} nm`}>
          <NumberControl language={language} label={translate(language, 'nominalDepositionThickness')} value={step.thicknessNm} min={2} max={160} step={2} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(thicknessNm) => onChange({ ...step, thicknessNm })} />
        </ParamInfo>
        <ParamInfo docId="deposition.sidewallFactor" label={translate(language, 'sidewallRate')} language={language} valueText={`${Math.round(step.sidewallFactor * 100)}%`}>
          <NumberControl language={language} label={translate(language, 'directionalSidewallRate')} value={step.sidewallFactor} min={0} max={1} step={0.05} onChange={(sidewallFactor) => onChange({ ...step, sidewallFactor })} />
        </ParamInfo>
      </div>
    )
  }

  if (step.type === 'etch') {
    return (
      <div className="step-editor">
        <ParamInfo docId="etch.target" label={translate(language, 'targetMaterial')} language={language}>
          <MaterialSelect value={step.target} onChange={(target) => onChange({ ...step, target })} />
        </ParamInfo>
        <ParamInfo docId="etch.mask" label={translate(language, 'etchMask')} language={language}>
          <div className="segmented-control">
            {(['layout', 'blanket'] as const).map((mask) => <button type="button" className={step.mask === mask ? 'active' : ''} key={mask} onClick={() => onChange({ ...step, mask })}>{translate(language, mask === 'layout' ? 'maskLayout' : 'maskBlanket')}</button>)}
          </div>
        </ParamInfo>
        <ParamInfo docId="etch.depthNm" label={translate(language, 'commandedDepth')} language={language} valueText={`${step.depthNm} nm`}>
          <NumberControl language={language} label={translate(language, 'etchDepth')} value={step.depthNm} min={2} max={240} step={2} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(depthNm) => onChange({ ...step, depthNm })} />
        </ParamInfo>
        <ParamInfo docId="etch.selectivity" label={translate(language, 'selectivity')} language={language} valueText={`${step.selectivity.toFixed(1)} : 1`}>
          <NumberControl language={language} label={translate(language, 'etchSelectivity')} value={step.selectivity} min={1} max={30} step={0.5} onChange={(selectivity) => onChange({ ...step, selectivity })} />
        </ParamInfo>
        <ParamInfo docId="etch.ardeFactor" label={translate(language, 'ardeLoading')} language={language} valueText={step.ardeFactor.toFixed(2)}>
          <NumberControl language={language} label={translate(language, 'ardeFactor')} value={step.ardeFactor} min={0} max={1.5} step={0.05} onChange={(ardeFactor) => onChange({ ...step, ardeFactor })} />
        </ParamInfo>
        <ParamInfo docId="etch.overlayNm" label={translate(language, 'lithographyOverlay')} language={language} valueText={`${step.overlayNm > 0 ? '+' : ''}${step.overlayNm} nm`}>
          <NumberControl language={language} label={translate(language, 'lithographyOverlay')} value={step.overlayNm} min={-80} max={80} step={1} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(overlayNm) => onChange({ ...step, overlayNm })} />
        </ParamInfo>
      </div>
    )
  }

  if (step.type === 'sadp') {
    return (
      <div className="step-editor">
        <ParamInfo docId="deposition.material" label={translate(language, 'spacerMaterial')} language={language}>
          <MaterialSelect value={step.spacerMaterial} onChange={(spacerMaterial) => onChange({ ...step, spacerMaterial })} />
        </ParamInfo>
        <ParamInfo docId="sadp.mandrelPitchNm" label={translate(language, 'mandrelPitch')} language={language} valueText={`${step.mandrelPitchNm} nm`}>
          <NumberControl language={language} label={translate(language, 'mandrelPitch')} value={step.mandrelPitchNm} min={24} max={180} step={2} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(mandrelPitchNm) => onChange({ ...step, mandrelPitchNm })} />
        </ParamInfo>
        <ParamInfo docId="sadp.mandrelWidthNm" label={translate(language, 'mandrelWidth')} language={language} valueText={`${step.mandrelWidthNm} nm`}>
          <NumberControl language={language} label={translate(language, 'mandrelWidth')} value={step.mandrelWidthNm} min={6} max={80} step={2} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(mandrelWidthNm) => onChange({ ...step, mandrelWidthNm })} />
        </ParamInfo>
        <ParamInfo docId="sadp.spacerThicknessNm" label={translate(language, 'spacerThickness')} language={language} valueText={`${step.spacerThicknessNm} nm`}>
          <NumberControl language={language} label={translate(language, 'spacerThickness')} value={step.spacerThicknessNm} min={2} max={32} step={2} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(spacerThicknessNm) => onChange({ ...step, spacerThicknessNm })} />
        </ParamInfo>
        <ParamInfo docId="sadp.spacerHeightNm" label={translate(language, 'spacerHeight')} language={language} valueText={`${step.spacerHeightNm} nm`}>
          <NumberControl language={language} label={translate(language, 'spacerHeight')} value={step.spacerHeightNm} min={8} max={100} step={2} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(spacerHeightNm) => onChange({ ...step, spacerHeightNm })} />
        </ParamInfo>
        <ParamInfo docId="sadp.pitchWalkNm" label={translate(language, 'pitchWalk')} language={language} valueText={`${step.pitchWalkNm > 0 ? '+' : ''}${step.pitchWalkNm} nm`}>
          <NumberControl language={language} label={translate(language, 'sadpPitchWalk')} value={step.pitchWalkNm} min={-20} max={20} step={1} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(pitchWalkNm) => onChange({ ...step, pitchWalkNm })} />
        </ParamInfo>
      </div>
    )
  }

  return (
    <div className="step-editor">
      <ParamInfo docId="planarize.targetHeightNm" label={translate(language, 'finalStackHeight')} language={language} valueText={`${step.targetHeightNm} nm`}>
        <NumberControl language={language} label={translate(language, 'planarizationTarget')} value={step.targetHeightNm} min={20} max={300} step={2} unit="nm" gridCellSizeNm={gridCellSizeNm} onChange={(targetHeightNm) => onChange({ ...step, targetHeightNm })} />
      </ParamInfo>
    </div>
  )
}

function newStep(type: ProcessStep['type']): ProcessStep {
  const common = { id: createId(type), enabled: true }
  if (type === 'deposit') return { ...common, type, name: 'Conformal oxide deposition', mode: 'conformal', material: 'silicon-dioxide', thicknessNm: 16, sidewallFactor: 0.15 }
  if (type === 'etch') return { ...common, type, name: 'Directional dielectric etch', target: 'low-k', depthNm: 90, selectivity: 8, ardeFactor: 0.35, mask: 'layout', overlayNm: 0 }
  if (type === 'sadp') return { ...common, type, name: 'Spacer pattern transfer', spacerMaterial: 'spacer', mandrelPitchNm: 80, mandrelWidthNm: 24, spacerThicknessNm: 8, spacerHeightNm: 32, pitchWalkNm: 0 }
  return { ...common, type, name: 'Planarize', targetHeightNm: 90 }
}

function synchronizeMandrelLayout(document: FlowDocument, step: SadpStep): LayoutDefinition {
  const existing = document.layout.features.filter((feature) => feature.role === 'mandrel')
  const nonMandrels = document.layout.features.filter((feature) => feature.role !== 'mandrel')
  const existingPoints = existing.flatMap((feature) => feature.points)
  const y0 = existingPoints.length ? Math.min(...existingPoints.map((point) => point.y)) : 0.1
  const y1 = existingPoints.length ? Math.max(...existingPoints.map((point) => point.y)) : 0.9
  const gridWidthNm = document.grid.width * document.grid.cellSizeNm
  const halfWidth = step.mandrelWidthNm / 2
  const features: LayoutDefinition['features'] = []
  let featureIndex = 0
  for (
    let centerNm = step.mandrelPitchNm / 2;
    centerNm < gridWidthNm;
    centerNm += step.mandrelPitchNm
  ) {
    const left = Math.max(0, (centerNm - halfWidth) / gridWidthNm)
    const right = Math.min(1, (centerNm + halfWidth) / gridWidthNm)
    if (right <= left) continue
    const prior = existing[featureIndex]
    features.push({
      id: prior?.id ?? createId('mandrel'),
      name: prior?.name ?? `Mandrel ${featureIndex + 1}`,
      role: 'mandrel' as const,
      visible: prior?.visible ?? true,
      points: [
        { x: left, y: y0 },
        { x: right, y: y0 },
        { x: right, y: y1 },
        { x: left, y: y1 },
      ],
    })
    featureIndex += 1
  }
  return { ...document.layout, features: [...nonMandrels, ...features] }
}

export function FlowEditor({ document, language, selectedStepId, previewStepId, onSelectedStepChange, onPreviewStepChange, onChange }: FlowEditorProps) {
  const update = (patch: Partial<FlowDocument>) => onChange({ ...document, ...patch, updatedAt: new Date().toISOString() })
  const updateLayer = (id: string, patch: Partial<BaseLayer>) => update({ baseLayers: document.baseLayers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer) })
  const updateStep = (index: number, step: ProcessStep) => {
    const current = document.steps[index]
    const shouldSynchronizeMandrels = current?.type === 'sadp' && step.type === 'sadp' && (
      current.mandrelPitchNm !== step.mandrelPitchNm ||
      current.mandrelWidthNm !== step.mandrelWidthNm
    )
    update({
      steps: document.steps.map((candidate, candidateIndex) => candidateIndex === index ? step : candidate),
      ...(shouldSynchronizeMandrels ? { layout: synchronizeMandrelLayout(document, step as SadpStep) } : {}),
    })
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction
    if (destination < 0 || destination >= document.steps.length) return
    const steps = [...document.steps]
    ;[steps[index], steps[destination]] = [steps[destination], steps[index]]
    update({ steps })
  }

  const addStep = (type: ProcessStep['type']) => {
    const step = newStep(type)
    update({
      steps: [...document.steps, step],
      ...(step.type === 'sadp' ? { layout: synchronizeMandrelLayout(document, step) } : {}),
    })
    onSelectedStepChange(step.id)
    onPreviewStepChange(step.id)
  }

  return (
    <div className="flow-panel">
      <div className="panel-intro">
        <span className="eyebrow">{translate(language, 'geometryRecipe')}</span>
        <input className="flow-name-input" aria-label={translate(language, 'flowName')} value={document.name} onChange={(event) => update({ name: event.target.value })} />
        <p>{translate(language, 'flowModelNote')}</p>
      </div>

      <details className="base-stack" open>
        <summary><span>{translate(language, 'startingStack')}</span><em>{translate(language, 'layerCount', { count: document.baseLayers.length })}</em></summary>
        <div className="base-layer-list">
          {[...document.baseLayers].reverse().map((layer) => (
            <div className="base-layer" key={layer.id}>
              <i style={{ background: MATERIALS.find((item) => item.id === layer.material)?.color }} />
              <div>
                <input aria-label={translate(language, 'layerName', { name: layer.name })} value={layer.name} onChange={(event) => updateLayer(layer.id, { name: event.target.value })} />
                <MaterialSelect value={layer.material} onChange={(material) => updateLayer(layer.id, { material })} />
              </div>
              <ParamInfo docId="base.thickness" label={translate(language, 'thickness')} language={language} valueText={`${layer.thicknessNm} nm`}>
                <NumberControl language={language} label={translate(language, 'layerThickness', { name: layer.name })} value={layer.thicknessNm} min={2} max={300} step={2} unit="nm" gridCellSizeNm={document.grid.cellSizeNm} onChange={(thicknessNm) => updateLayer(layer.id, { thicknessNm })} />
              </ParamInfo>
            </div>
          ))}
        </div>
      </details>

      <div className="flow-sequence-heading">
        <span>{translate(language, 'processSequence')}</span>
        <em>{translate(language, 'stepCount', { count: document.steps.length })}</em>
      </div>

      <div className="step-list">
        {document.steps.length === 0 && (
          <div className="empty-state compact"><span>01</span><p>{translate(language, 'addStepHint')}</p></div>
        )}
        {document.steps.map((step, index) => {
          const selected = selectedStepId === step.id
          const previewed = previewStepId === step.id
          return (
            <article className={`step-card ${selected ? 'selected' : ''} ${previewed ? 'previewed' : ''} ${step.enabled ? '' : 'disabled'}`} key={step.id}>
              <button className="step-card-header" type="button" onClick={() => onSelectedStepChange(selected ? null : step.id)}>
                <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
                <i style={{ background: STEP_LABEL[step.type].color }} />
                <span className="step-title"><small>{STEP_LABEL[step.type].kicker}{previewed ? ` · ${translate(language, 'preview')}` : ''}</small>{step.name}</span>
                <span className="chevron">{selected ? '−' : '+'}</span>
              </button>
              {selected && (
                <div className="step-card-body">
                  {previewed ? (
                    <p className="preview-sync-note synced">{translate(language, 'editingPreviewing')}</p>
                  ) : (
                    <div className="preview-sync-note"><span>{translate(language, 'previewDifferent')}</span><button type="button" onClick={() => onPreviewStepChange(step.id)}>{translate(language, 'previewThisStep')}</button></div>
                  )}
                  <input className="step-name-input" aria-label={translate(language, 'stepName')} value={step.name} onChange={(event) => updateStep(index, { ...step, name: event.target.value })} />
                  <StepEditor step={step} gridCellSizeNm={document.grid.cellSizeNm} language={language} onChange={(next) => updateStep(index, next)} />
                  <div className="step-card-actions">
                    <label className="switch-label"><input type="checkbox" checked={step.enabled} onChange={(event) => updateStep(index, { ...step, enabled: event.target.checked })} /><span />{translate(language, 'enabled')}</label>
                    <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0}>↑</button>
                    <button type="button" onClick={() => moveStep(index, 1)} disabled={index === document.steps.length - 1}>↓</button>
                    <button type="button" className="danger-button" onClick={() => {
                      const previousStepId = document.steps[index - 1]?.id ?? null
                      update({ steps: document.steps.filter((_, candidateIndex) => candidateIndex !== index) })
                      onSelectedStepChange(null)
                      if (previewStepId === step.id) onPreviewStepChange(previousStepId)
                    }}>{translate(language, 'remove')}</button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="add-step-grid">
        <button type="button" onClick={() => addStep('deposit')}><span>+</span> {translate(language, 'deposition')}</button>
        <button type="button" onClick={() => addStep('etch')}><span>+</span> {translate(language, 'etch')}</button>
        <button type="button" onClick={() => addStep('sadp')}><span>+</span> SADP</button>
        <button type="button" onClick={() => addStep('planarize')}><span>+</span> {translate(language, 'planarize')}</button>
      </div>
    </div>
  )
}
