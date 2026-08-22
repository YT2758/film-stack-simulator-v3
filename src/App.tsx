import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FlowDocument } from './domain/flow'
import { createBlankFlow } from './domain/defaults'
import { simulateFlow } from './engine/simulate'
import { getPresetById, type PresetDefinition } from './presets'
import { decodeFlowFragment, encodeFlowFragment } from './persistence/share-codec'
import { parseFlowJson, stringifyFlow } from './persistence/flow-codec'
import { getLastSession, setLastSession } from './persistence/indexed-db'
import { FlowEditor } from './components/FlowEditor'
import { LayoutEditor } from './components/LayoutEditor'
import { StackLibrary } from './components/StackLibrary'
import { CrossSectionCanvas } from './components/CrossSectionCanvas'
import { TrustBanner } from './components/TrustBanner'
import { translate, type Language } from './i18n'

const ThreeViewer = lazy(() => import('./components/ThreeViewer'))

type SideTab = 'flow' | 'layout' | 'library'
type ViewMode = '2d' | '3d'

interface StartupState {
  document: FlowDocument
  preset?: PresetDefinition
  source: 'blank' | 'preset' | 'fragment' | 'invalid-link'
  warning?: string
}

function initialState(): StartupState {
  const parameters = new URLSearchParams(window.location.search)
  const presetId = parameters.get('preset')
  if (presetId) {
    const preset = getPresetById(presetId)
    if (preset) return { document: structuredClone(preset.document), preset, source: 'preset' }
    return { document: createBlankFlow(), source: 'invalid-link', warning: `Unknown preset “${presetId}”. A blank local flow was opened instead.` }
  }
  if (window.location.hash.startsWith('#state=')) {
    try {
      return { document: decodeFlowFragment(window.location.hash), source: 'fragment' }
    } catch (error) {
      return { document: createBlankFlow(), source: 'invalid-link', warning: error instanceof Error ? error.message : 'The share link could not be restored.' }
    }
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
  const [selectedStep, setSelectedStep] = useState(-1)
  const [stage, setStage] = useState(startup.document.steps.length)
  const [playing, setPlaying] = useState(false)
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('film-stack-language') === 'zh-TW' ? 'zh-TW' : 'en')
  const [resumeCandidate, setResumeCandidate] = useState<FlowDocument | null>(null)
  const [resumeChecked, setResumeChecked] = useState(startup.source !== 'blank')
  const [autosaveArmed, setAutosaveArmed] = useState(startup.source === 'blank')
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' } | null>(startup.warning ? { message: startup.warning, tone: 'warning' } : null)
  const [draggingFile, setDraggingFile] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const snapshots = useMemo(() => simulateFlow(flow, flow.layout.cutPosition), [flow])
  const safeStage = Math.min(stage, Math.max(0, snapshots.length - 1))
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
    void getLastSession().then((document) => {
      if (active && document) setResumeCandidate(document)
    }).finally(() => { if (active) setResumeChecked(true) })
    return () => { active = false }
  }, [startup.source])

  useEffect(() => {
    if (!resumeChecked || resumeCandidate || !autosaveArmed) return
    const timeout = window.setTimeout(() => {
      void setLastSession(flow).catch(() => showNotice('Autosave is unavailable. Export JSON to protect this work.', 'warning'))
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [autosaveArmed, flow, resumeCandidate, resumeChecked, showNotice])

  useEffect(() => {
    if (!playing) return
    if (safeStage >= flow.steps.length) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setStage((current) => current + 1), 650)
    return () => window.clearTimeout(timer)
  }, [playing, safeStage, flow.steps.length])

  useEffect(() => {
    setStage(flow.steps.length)
  }, [flow.steps.length])

  const changeFlow = useCallback((next: FlowDocument) => {
    setAutosaveArmed(true)
    setFlow(next)
  }, [])

  const replaceFlow = (next: FlowDocument, source: 'local' | 'import' = 'local') => {
    changeFlow(next)
    setStage(next.steps.length)
    setSelectedStep(-1)
    setPreset(undefined)
    setResumeCandidate(null)
    window.history.replaceState(null, '', window.location.pathname)
    if (source === 'import') showNotice('Imported locally. No file contents were uploaded.', 'success')
  }

  const importFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a Film Stack Simulator JSON file.')
    replaceFlow(parseFlowJson(await file.text()), 'import')
  }

  const copyShareLink = async () => {
    const fragment = encodeFlowFragment(flow)
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`
    try {
      await navigator.clipboard.writeText(url)
      showNotice('Share link copied. Its fragment stays out of server requests, but anyone you send it to can read it.', 'success')
    } catch {
      window.history.replaceState(null, '', `#${fragment}`)
      showNotice('The link is now in your address bar. Copy it manually.', 'warning')
    }
  }

  const sidebarTitle = sideTab === 'flow' ? translate(language, 'flow') : sideTab === 'layout' ? translate(language, 'layout') : translate(language, 'library')

  return (
    <div className="app" data-testid="simulator" onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) setDraggingFile(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDraggingFile(false) }} onDrop={(event) => {
      event.preventDefault()
      setDraggingFile(false)
      const file = event.dataTransfer.files[0]
      if (file) void importFile(file).catch((error) => showNotice(error instanceof Error ? error.message : 'Import failed.', 'warning'))
    }}>
      <TrustBanner language={language} onLanguageChange={setLanguage} />

      {preset && (
        <div className="preset-banner">
          <span className="preset-chip">PRESET</span>
          <div><strong>{preset.title}</strong><p>{preset.summary}</p></div>
          <a href={`/case-studies/${preset.articleSlug}/`}>Back to the article ←</a>
          <button type="button" onClick={() => setPreset(undefined)} aria-label="Dismiss preset context">×</button>
        </div>
      )}

      <main className="workspace">
        <aside className="sidebar">
          <nav className="side-tabs" aria-label="Simulator controls">
            {([
              ['flow', 'Flow', 'F'], ['layout', 'Layout', 'L'], ['library', 'Stacks', 'S'],
            ] as [SideTab, string, string][]).map(([id, label, glyph]) => (
              <button type="button" key={id} className={sideTab === id ? 'active' : ''} onClick={() => setSideTab(id)}><span>{glyph}</span>{label}</button>
            ))}
          </nav>
          <div className="sidebar-heading"><span>{sidebarTitle}</span><em>LOCAL</em></div>
          <div className="sidebar-content">
            {sideTab === 'flow' && <FlowEditor document={flow} selectedStep={selectedStep} onSelectedStepChange={setSelectedStep} onChange={changeFlow} />}
            {sideTab === 'layout' && <LayoutEditor layout={flow.layout} onChange={(layout) => changeFlow({ ...flow, layout, updatedAt: new Date().toISOString() })} />}
            {sideTab === 'library' && <StackLibrary current={flow} language={language} onLoad={replaceFlow} onNotice={showNotice} />}
          </div>
          <div className="sidebar-disclosure"><span className="status-dot" /> Browser storage only</div>
        </aside>

        <section className="stage-area">
          <div className="stage-toolbar">
            <div>
              <span className="eyebrow">Authoritative geometry</span>
              <h1>{flow.name}</h1>
            </div>
            <div className="view-tabs" role="tablist" aria-label="Visualization mode">
              <button data-testid="view-2d" role="tab" aria-selected={view === '2d'} className={view === '2d' ? 'active' : ''} type="button" onClick={() => setView('2d')}><span>▤</span>{translate(language, 'crossSection')}</button>
              <button data-testid="view-3d" role="tab" aria-selected={view === '3d'} className={view === '3d' ? 'active' : ''} type="button" onClick={() => setView('3d')}><span>◇</span>{translate(language, 'threeView')}</button>
            </div>
          </div>

          <div className="visualization-shell">
            <div className="view-caption">
              <div><span className="live-indicator"><i /> LOCAL COMPUTE</span><strong>{snapshot.stepName}</strong></div>
              <span>Cut Y {Math.round(flow.layout.cutPosition * 100)}% · step {safeStage}/{flow.steps.length}</span>
            </div>
            {view === '2d' ? (
              <CrossSectionCanvas snapshot={snapshot} />
            ) : (
              <Suspense fallback={<div className="viewer-loading"><span /><p>Loading the local 3D renderer…</p></div>}>
                <ThreeViewer className="three-viewer" document={flow} throughStep={Math.max(-1, safeStage - 1)} onCutPositionChange={(cutPosition) => changeFlow({ ...flow, layout: { ...flow.layout, cutPosition }, updatedAt: new Date().toISOString() })} />
              </Suspense>
            )}
          </div>

          <div className="timeline-panel">
            <button type="button" aria-label="Go to starting stack" onClick={() => { setPlaying(false); setStage(0) }}>↤</button>
            <button type="button" aria-label={playing ? 'Pause playback' : 'Play process flow'} className="play-button" onClick={() => {
              if (safeStage >= flow.steps.length) setStage(0)
              setPlaying((current) => !current)
            }}>{playing ? 'Ⅱ' : '▶'}</button>
            <input data-testid="playback-range" aria-label="Process playback position" type="range" min="0" max={flow.steps.length} step="1" value={safeStage} onChange={(event) => { setPlaying(false); setStage(Number(event.target.value)) }} />
            <div><strong>{safeStage === 0 ? 'Starting stack' : flow.steps[safeStage - 1]?.name}</strong><small>{safeStage === flow.steps.length ? translate(language, 'finalState') : `${flow.steps.length - safeStage} steps remaining`}</small></div>
            <span className="timeline-count">{String(safeStage).padStart(2, '0')} / {String(flow.steps.length).padStart(2, '0')}</span>
          </div>

          <div className="metric-grid">
            <div><span>ETCHED DEPTH</span><strong>{Math.round(snapshot.metrics.etchedDepthNm)}<small> nm</small></strong><i style={{ width: `${Math.min(100, snapshot.metrics.etchedDepthNm / 2)}%` }} /></div>
            <div><span>OPEN COLUMNS</span><strong>{snapshot.metrics.openColumns}<small> / {snapshot.width}</small></strong><i style={{ width: `${snapshot.metrics.openColumns / snapshot.width * 100}%` }} /></div>
            <div><span>ENCLOSED VOIDS</span><strong>{snapshot.metrics.voidCount}<small> cells</small></strong><i className={snapshot.metrics.voidCount ? 'warn' : ''} style={{ width: `${Math.min(100, snapshot.metrics.voidCount)}%` }} /></div>
            <div><span>VIA LANDED AREA</span><strong>{snapshot.metrics.viaLandedAreaPercent === undefined ? '—' : Math.round(snapshot.metrics.viaLandedAreaPercent)}<small>{snapshot.metrics.viaLandedAreaPercent === undefined ? '' : '%'}</small></strong><i style={{ width: `${snapshot.metrics.viaLandedAreaPercent ?? 0}%` }} /></div>
          </div>

          <div className="local-actions">
            <div><span className="lock-glyph">⌁</span><p><strong>Local-first workspace</strong>{translate(language, 'storedOnly')}</p></div>
            <div>
              <button data-testid="export-json" type="button" onClick={() => downloadText(`${safeFilename(flow.name)}.json`, stringifyFlow(flow))}>{translate(language, 'exportJson')}</button>
              <button type="button" onClick={() => fileInput.current?.click()}>{translate(language, 'importJson')}</button>
              <button type="button" onClick={() => void copyShareLink()}>{translate(language, 'share')}</button>
              <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importFile(file).catch((error) => showNotice(error instanceof Error ? error.message : 'Import failed.', 'warning'))
                event.target.value = ''
              }} />
            </div>
          </div>

          <CaseStudyStrip />
        </section>
      </main>

      {notice && <div className={`toast ${notice.tone}`} role="status"><span>{notice.tone === 'success' ? '✓' : '!'}</span><p>{notice.message}</p><button type="button" onClick={() => setNotice(null)}>×</button></div>}

      {!resumeChecked && <div className="startup-screen"><span className="brand-mark"><i /><i /><i /></span><p>Opening the local workspace…</p></div>}
      {resumeCandidate && (
        <div className="modal-backdrop" role="presentation">
          <section className="resume-modal" role="dialog" aria-modal="true" aria-labelledby="resume-title">
            <span className="modal-icon">↻</span>
            <span className="eyebrow">Found in this browser</span>
            <h2 id="resume-title">{translate(language, 'resumeTitle')}</h2>
            <p>{translate(language, 'resumeBody')}</p>
            <div className="resume-preview"><strong>{resumeCandidate.name}</strong><span>{resumeCandidate.steps.length} steps · edited {new Date(resumeCandidate.updatedAt).toLocaleString()}</span></div>
            <div><button type="button" className="primary-button" onClick={() => {
              changeFlow(resumeCandidate)
              setStage(resumeCandidate.steps.length)
              setResumeCandidate(null)
            }}>{translate(language, 'resume')}</button><button type="button" className="subtle-button" onClick={() => setResumeCandidate(null)}>{translate(language, 'startFresh')}</button></div>
          </section>
        </div>
      )}

      {draggingFile && <div className="drop-overlay"><span>↓</span><strong>Drop a flow JSON</strong><p>Parsed locally. Nothing is uploaded.</p></div>}
    </div>
  )
}
