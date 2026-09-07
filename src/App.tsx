import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FlowDocument } from './domain/flow'
import { createBlankFlow } from './domain/defaults'
import { simulateFlow } from './engine/simulate'
import { getPresetById, type PresetDefinition } from './presets'
import { decodeFlowFragment, encodeFlowFragment } from './persistence/share-codec'
import { parseFlowJson, stringifyFlow } from './persistence/flow-codec'
import { DraftConflictError, getLastSessionRecord, setLastSession } from './persistence/indexed-db'
import { FlowEditor } from './components/FlowEditor'
import { LayoutEditor } from './components/LayoutEditor'
import { StackLibrary } from './components/StackLibrary'
import { CrossSectionCanvas } from './components/CrossSectionCanvas'
import { CrossSectionComparison } from './components/CrossSectionComparison'
import { MetricGrid, type MetricKind } from './components/MetricGrid'
import { TrustBanner } from './components/TrustBanner'
import { translate, type AutosaveStatus, type Language } from './i18n'

const ThreeViewer = lazy(() => import('./components/ThreeViewer'))

type SideTab = 'flow' | 'layout' | 'library'
type ViewMode = '2d' | 'compare' | '3d'

interface StartupState {
  document: FlowDocument
  preset?: PresetDefinition
  source: 'blank' | 'preset' | 'fragment' | 'invalid-link'
  warning?: { kind: 'invalid-share' } | { kind: 'unknown-preset'; id: string }
}

function initialState(): StartupState {
  const parameters = new URLSearchParams(window.location.search)
  const presetId = parameters.get('preset')
  // Explicit share state is the most specific source, followed by a preset.
  // Browser storage is considered only when neither is present.
  if (window.location.hash.startsWith('#state=')) {
    try {
      return { document: decodeFlowFragment(window.location.hash), source: 'fragment' }
    } catch (error) {
      return { document: createBlankFlow(), source: 'invalid-link', warning: { kind: 'invalid-share' } }
    }
  }
  if (presetId) {
    const preset = getPresetById(presetId)
    if (preset) return { document: structuredClone(preset.document), preset, source: 'preset' }
    return { document: createBlankFlow(), source: 'invalid-link', warning: { kind: 'unknown-preset', id: presetId } }
  }
  return { document: createBlankFlow(), source: 'blank' }
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'film-stack'
}

function CaseStudyStrip() {
  const studies = [
    { index: '01', tag: 'PLASMA ETCH', title: 'Why deep openings etch slower', summary: 'See how transport-limited ARDE changes depth across different critical dimensions.', href: '/case-studies/arde-deep-etch-slower/' },
    { index: '02', tag: 'PATTERNING', title: 'Where SADP pitch walking begins', summary: 'Trace the asymmetry from mandrel edge placement to spacer-defined pitch.', href: '/case-studies/sadp-pitch-walking/' },
    { index: '03', tag: 'INTERCONNECT', title: 'Your real borderless-via margin', summary: 'Turn overlay offset into landed-area loss before an edge becomes fully unlanded.', href: '/case-studies/borderless-via-overlay-margin/' },
  ]
  return (
    <section className="case-study-strip" aria-labelledby="case-study-heading">
      <div className="case-study-heading">
        <div><span className="eyebrow">Mechanism-first notes</span><h2 id="case-study-heading">Case studies</h2></div>
        <a href="/case-studies/">Browse all notes →</a>
      </div>
      <div className="case-study-grid">
        {studies.map((study) => (
          <a href={study.href} key={study.index}>
            <span className="study-index">{study.index}</span>
            <span className="study-copy"><small>{study.tag}</small><strong>{study.title}</strong><p>{study.summary}</p></span>
            <span className="study-arrow">↗</span>
          </a>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const startup = useMemo(initialState, [])
  const [flow, setFlow] = useState(startup.document)
  const [preset, setPreset] = useState(startup.preset)
  const [sideTab, setSideTab] = useState<SideTab>('flow')
  const [view, setView] = useState<ViewMode>('2d')
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [previewStepId, setPreviewStepId] = useState<string | null>(() => startup.document.steps.at(-1)?.id ?? null)
  const [playing, setPlaying] = useState(false)
  const [activeMetric, setActiveMetric] = useState<MetricKind | null>(null)
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('film-stack-language') === 'zh-TW' ? 'zh-TW' : 'en')
  const [resumeCandidate, setResumeCandidate] = useState<FlowDocument | null>(null)
  const [resumeChecked, setResumeChecked] = useState(startup.source !== 'blank')
  const [autosaveArmed, setAutosaveArmed] = useState(startup.source === 'blank')
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>(startup.source === 'blank' ? 'checking' : 'pending')
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' } | null>(startup.warning ? {
    message: startup.warning.kind === 'invalid-share' ? translate(language, 'invalidShare') : translate(language, 'unknownPreset', { id: startup.warning.id }),
    tone: 'warning',
  } : null)
  const [draggingFile, setDraggingFile] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const draftRevisionRef = useRef<number | null>(null)
  const flowGenerationRef = useRef(0)
  const writerIdRef = useRef(`tab-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`)

  const snapshots = useMemo(() => simulateFlow(flow, flow.layout.cutPosition), [flow])
  const previewStepIndex = previewStepId === null ? -1 : flow.steps.findIndex((step) => step.id === previewStepId)
  const safeStage = previewStepIndex + 1
  const snapshot = snapshots[safeStage] ?? snapshots[0]

  const showNotice = useCallback((message: string, tone: 'success' | 'warning' = 'success') => {
    setNotice({ message, tone })
  }, [])

  useEffect(() => {
    window.localStorage.setItem('film-stack-language', language)
  }, [language])

  useEffect(() => {
    if (startup.source !== 'blank') return
    let active = true
    void getLastSessionRecord().then((record) => {
      if (!active) return
      draftRevisionRef.current = record?.revision ?? null
      if (record) setResumeCandidate(record.document)
      setSaveStatus(record ? 'pending' : 'saved')
    }).finally(() => { if (active) setResumeChecked(true) })
    return () => { active = false }
  }, [startup.source])

  useEffect(() => {
    if (!resumeChecked || resumeCandidate || !autosaveArmed || saveStatus !== 'pending') return
    const timeout = window.setTimeout(() => {
      const savingGeneration = flowGenerationRef.current
      setSaveStatus('saving')
      void setLastSession(flow, {
        writerId: writerIdRef.current,
        expectedRevision: draftRevisionRef.current,
      }).then((record) => {
        draftRevisionRef.current = record.revision
        setSaveStatus(flowGenerationRef.current === savingGeneration ? 'saved' : 'pending')
      }).catch((error) => {
        setSaveStatus('error')
        if (error instanceof DraftConflictError) {
          setAutosaveArmed(false)
          setSaveStatus('conflict')
          showNotice(translate(language, 'conflictNotice'), 'warning')
          return
        }
        setAutosaveArmed(false)
        showNotice(translate(language, 'autosaveUnavailable'), 'warning')
      })
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [autosaveArmed, flow, language, resumeCandidate, resumeChecked, saveStatus, showNotice])

  useEffect(() => {
    if (!playing) return
    if (safeStage >= flow.steps.length) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      const nextStep = flow.steps[safeStage]
      setPreviewStepId(nextStep?.id ?? flow.steps.at(-1)?.id ?? null)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [playing, safeStage, flow.steps.length])

  const changeFlow = useCallback((next: FlowDocument) => {
    flowGenerationRef.current += 1
    if (saveStatus !== 'conflict' && saveStatus !== 'error') {
      setAutosaveArmed(true)
      if (saveStatus !== 'saving') setSaveStatus('pending')
    }
    setFlow(next)
  }, [saveStatus])

  const replaceFlow = (next: FlowDocument, source: 'local' | 'import' = 'local') => {
    changeFlow(next)
    setPreviewStepId(next.steps.at(-1)?.id ?? null)
    setSelectedStepId(null)
    setPreset(undefined)
    setResumeCandidate(null)
    window.history.replaceState(null, '', window.location.pathname)
    if (source === 'import') showNotice(translate(language, 'importSuccess'), 'success')
  }

  const importFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) throw new Error(translate(language, 'chooseJson'))
    replaceFlow(parseFlowJson(await file.text()), 'import')
  }

  const copyShareLink = async () => {
    const fragment = encodeFlowFragment(flow)
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`
    try {
      await navigator.clipboard.writeText(url)
      showNotice(translate(language, 'shareCopied'), 'success')
    } catch {
      window.history.replaceState(null, '', `#${fragment}`)
      showNotice(translate(language, 'shareManual'), 'warning')
    }
  }

  const exportCurrentWork = () => downloadText(`${safeFilename(flow.name)}.json`, stringifyFlow(flow))

  const loadNewerDraft = async () => {
    if (!window.confirm(translate(language, 'replaceDraftWarning'))) return
    const record = await getLastSessionRecord()
    if (!record) {
      showNotice(translate(language, 'newerDraftMissing'), 'warning')
      return
    }
    draftRevisionRef.current = record.revision
    setFlow(record.document)
    setPreviewStepId(record.document.steps.at(-1)?.id ?? null)
    setSelectedStepId(null)
    setPreset(undefined)
    setResumeCandidate(null)
    setAutosaveArmed(true)
    setSaveStatus('saved')
    showNotice(translate(language, 'newerDraftLoaded'), 'success')
  }

  const retryAutosave = () => {
    setAutosaveArmed(true)
    setSaveStatus('pending')
    showNotice(translate(language, 'autosaveRetrying'), 'success')
  }

  const sidebarTitle = sideTab === 'flow' ? translate(language, 'flow') : sideTab === 'layout' ? translate(language, 'layout') : translate(language, 'library')

  if (!resumeChecked) {
    return <div className="startup-screen" role="status" aria-live="polite"><span className="brand-mark"><i /><i /><i /></span><p>{translate(language, 'openingDraft')}</p></div>
  }

  return (
    <div className="app" data-testid="simulator" onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) setDraggingFile(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDraggingFile(false) }} onDrop={(event) => {
      event.preventDefault()
      setDraggingFile(false)
      const file = event.dataTransfer.files[0]
      if (file) void importFile(file).catch((error) => showNotice(error instanceof Error ? error.message : translate(language, 'importFailed'), 'warning'))
    }}>
      <TrustBanner language={language} onLanguageChange={setLanguage} />

      {preset && (
        <div className="preset-banner">
          <span className="preset-chip">{translate(language, 'preset')}</span>
          <div><strong>{preset.title}</strong><p>{preset.summary}</p></div>
          <a href={`/case-studies/${preset.articleSlug}/`}>{translate(language, 'backToArticle')}</a>
          <button type="button" onClick={() => setPreset(undefined)} aria-label={translate(language, 'dismissPreset')}>×</button>
        </div>
      )}

      <main className="workspace">
        <aside className="sidebar">
          <nav className="side-tabs" aria-label={translate(language, 'simulatorControls')}>
            {([
              ['flow', translate(language, 'flow'), 'F'], ['layout', translate(language, 'layout'), 'L'], ['library', translate(language, 'stacksTab'), 'S'],
            ] as [SideTab, string, string][]).map(([id, label, glyph]) => (
              <button type="button" key={id} className={sideTab === id ? 'active' : ''} onClick={() => setSideTab(id)}><span>{glyph}</span>{label}</button>
            ))}
          </nav>
          <div className="sidebar-heading"><span>{sidebarTitle}</span><em>{translate(language, 'local')}</em></div>
          <div className="sidebar-content">
            {sideTab === 'flow' && <FlowEditor document={flow} language={language} selectedStepId={selectedStepId} previewStepId={previewStepId} onSelectedStepChange={setSelectedStepId} onPreviewStepChange={setPreviewStepId} onChange={changeFlow} />}
            {sideTab === 'layout' && <LayoutEditor layout={flow.layout} language={language} grid={flow.grid} viaMeasurement={activeMetric === 'via-landed-area' ? snapshot.metrics.viaAreaCells : undefined} onChange={(layout) => changeFlow({ ...flow, layout, updatedAt: new Date().toISOString() })} />}
            {sideTab === 'library' && <StackLibrary current={flow} language={language} autosaveStatus={saveStatus} onLoad={replaceFlow} onNotice={showNotice} />}
          </div>
          {(saveStatus === 'conflict' || saveStatus === 'error') && (
            <section className={`save-recovery save-${saveStatus}`} role="alert" aria-live="polite">
              <strong>{translate(language, saveStatus === 'conflict' ? 'conflictTitle' : 'errorTitle')}</strong>
              <p>{translate(language, saveStatus === 'conflict' ? 'conflictBody' : 'errorBody')}</p>
              <div>
                <button type="button" onClick={exportCurrentWork}>{translate(language, 'exportCurrentJson')}</button>
                {saveStatus === 'conflict'
                  ? <button type="button" onClick={() => void loadNewerDraft()}>{translate(language, 'loadNewerDraft')}</button>
                  : <button type="button" onClick={retryAutosave}>{translate(language, 'retryAutosave')}</button>}
              </div>
            </section>
          )}
          <div className={`sidebar-disclosure save-${saveStatus}`} role="status"><span className="status-dot" /> {translate(language, 'browserStorageOnly', { status: translate(language, saveStatus === 'checking' ? 'saveChecking' : saveStatus === 'pending' ? 'savePending' : saveStatus === 'saving' ? 'saveSaving' : saveStatus === 'saved' ? 'saveSaved' : saveStatus === 'conflict' ? 'saveConflict' : 'saveError') })}</div>
        </aside>

        <section className="stage-area">
          <div className="stage-toolbar">
            <div>
              <span className="eyebrow">{translate(language, 'authoritativeGeometry')}</span>
              <h1>{flow.name}</h1>
            </div>
            <div className="view-tabs" role="tablist" aria-label={translate(language, 'visualizationMode')}>
              <button data-testid="view-2d" role="tab" aria-selected={view === '2d'} className={view === '2d' ? 'active' : ''} type="button" onClick={() => setView('2d')}><span>▤</span>{translate(language, 'crossSection')}</button>
              <button data-testid="view-compare" role="tab" aria-selected={view === 'compare'} className={view === 'compare' ? 'active' : ''} type="button" onClick={() => setView('compare')}><span>◫</span>{translate(language, 'compare')}</button>
              <button data-testid="view-3d" role="tab" aria-selected={view === '3d'} className={view === '3d' ? 'active' : ''} type="button" onClick={() => setView('3d')}><span>◇</span>{translate(language, 'threeView')}</button>
            </div>
          </div>

          <div className="visualization-shell">
            <div className="view-caption">
              <div><span className="live-indicator"><i /> {translate(language, 'localCompute')}</span><strong>{snapshot.stepName}</strong></div>
              <span>{translate(language, 'cutStep', { cut: Math.round(flow.layout.cutPosition * 100), current: safeStage, total: flow.steps.length })}</span>
            </div>
            {view === '2d' ? (
              <CrossSectionCanvas snapshot={snapshot} document={flow} measurement={activeMetric} language={language} />
            ) : view === 'compare' ? (
              <CrossSectionComparison previous={snapshots[Math.max(0, safeStage - 1)] ?? snapshots[0]} current={snapshot} document={flow} measurement={activeMetric} language={language} />
            ) : (
              <Suspense fallback={<div className="viewer-loading"><span /><p>{translate(language, 'loading3d')}</p></div>}>
                <ThreeViewer className="three-viewer" language={language} document={flow} throughStep={Math.max(-1, safeStage - 1)} onCutPositionChange={(cutPosition) => changeFlow({ ...flow, layout: { ...flow.layout, cutPosition }, updatedAt: new Date().toISOString() })} onReturnTo2D={() => setView('2d')} />
              </Suspense>
            )}
          </div>

          <div className="timeline-panel">
            <button type="button" aria-label={translate(language, 'goToStartingStack')} onClick={() => { setPlaying(false); setPreviewStepId(null) }}>↤</button>
            <button type="button" aria-label={translate(language, playing ? 'pausePlayback' : 'playProcess')} className="play-button" onClick={() => {
              if (safeStage >= flow.steps.length) setPreviewStepId(null)
              setPlaying((current) => !current)
            }}>{playing ? 'Ⅱ' : '▶'}</button>
            <input data-testid="playback-range" aria-label={translate(language, 'playbackPosition')} type="range" min="0" max={flow.steps.length} step="1" value={safeStage} onChange={(event) => {
              setPlaying(false)
              const nextStage = Number(event.target.value)
              setPreviewStepId(nextStage === 0 ? null : flow.steps[nextStage - 1]?.id ?? null)
            }} />
            <div><strong>{safeStage === 0 ? translate(language, 'startingStack') : flow.steps[safeStage - 1]?.name}</strong><small>{safeStage === flow.steps.length ? translate(language, 'finalState') : translate(language, 'stepsRemaining', { count: flow.steps.length - safeStage })}</small></div>
            <span className="timeline-count">{String(safeStage).padStart(2, '0')} / {String(flow.steps.length).padStart(2, '0')}</span>
          </div>

          <MetricGrid snapshot={snapshot} language={language} active={activeMetric} onActiveChange={setActiveMetric} onShowViaMeasurement={() => setSideTab('layout')} />

          <div className="local-actions">
            <div><span className="lock-glyph">⌁</span><p><strong>{translate(language, 'localWorkspace')}</strong>{translate(language, 'storedOnly')}</p></div>
            <div>
              <button data-testid="export-json" type="button" onClick={exportCurrentWork}>{translate(language, 'exportJson')}</button>
              <button type="button" onClick={() => fileInput.current?.click()}>{translate(language, 'importJson')}</button>
              <button type="button" onClick={() => void copyShareLink()}>{translate(language, 'share')}</button>
              <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importFile(file).catch((error) => showNotice(error instanceof Error ? error.message : translate(language, 'importFailed'), 'warning'))
                event.target.value = ''
              }} />
            </div>
          </div>

          <CaseStudyStrip />
        </section>
      </main>

      {notice && <div className={`toast ${notice.tone}`} role="status"><span>{notice.tone === 'success' ? '✓' : '!'}</span><p>{notice.message}</p><button type="button" aria-label={translate(language, 'closeNotice')} onClick={() => setNotice(null)}>×</button></div>}

      {resumeCandidate && (
        <div className="modal-backdrop" role="presentation">
          <section className="resume-modal" role="dialog" aria-modal="true" aria-labelledby="resume-title">
            <span className="modal-icon">↻</span>
            <span className="eyebrow">{translate(language, 'foundInBrowser')}</span>
            <h2 id="resume-title">{translate(language, 'resumeTitle')}</h2>
            <p>{translate(language, 'resumeBody')}</p>
            <div className="resume-preview"><strong>{resumeCandidate.name}</strong><span>{translate(language, 'resumePreview', { steps: resumeCandidate.steps.length, edited: new Date(resumeCandidate.updatedAt).toLocaleString(language === 'zh-TW' ? 'zh-TW' : 'en') })}</span></div>
            <div><button type="button" className="primary-button" onClick={() => {
              setFlow(resumeCandidate)
              setAutosaveArmed(true)
              setSaveStatus('saved')
              setPreviewStepId(resumeCandidate.steps.at(-1)?.id ?? null)
              setResumeCandidate(null)
            }}>{translate(language, 'resume')}</button><button type="button" className="subtle-button" onClick={() => setResumeCandidate(null)}>{translate(language, 'startFresh')}</button></div>
          </section>
        </div>
      )}

      {draggingFile && <div className="drop-overlay"><span>↓</span><strong>{translate(language, 'dropFlow')}</strong><p>{translate(language, 'dropFlowDetail')}</p></div>}
    </div>
  )
}
