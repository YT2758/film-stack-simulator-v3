import { useCallback, useEffect, useRef, useState } from 'react'
import { createId, type FlowDocument } from '../domain/flow'
import {
  deleteSavedStack,
  listSavedStacks,
  renameSavedStack,
  saveNamedStack,
  type SavedStack,
} from '../persistence/indexed-db'
import type { AutosaveStatus, Language, MessageKey } from '../i18n'
import { translate } from '../i18n'

interface StackLibraryProps {
  current: FlowDocument
  language: Language
  autosaveStatus: AutosaveStatus
  onLoad: (document: FlowDocument) => void
  onNotice: (message: string, tone?: 'success' | 'warning') => void
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function StackLibrary({ current, language, autosaveStatus, onLoad, onNotice }: StackLibraryProps) {
  const [stacks, setStacks] = useState<SavedStack[]>([])
  const [name, setName] = useState(current.name)
  const [loading, setLoading] = useState(true)
  const [readFailed, setReadFailed] = useState(false)
  const [operationError, setOperationError] = useState<MessageKey | null>(null)
  const [updating, setUpdating] = useState(false)
  const operationInFlight = useRef(false)
  const refreshGeneration = useRef(0)

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current
    setLoading(true)
    try {
      const records = await listSavedStacks()
      if (generation !== refreshGeneration.current) return
      setStacks(records)
      setReadFailed(false)
    } catch {
      if (generation === refreshGeneration.current) setReadFailed(true)
    } finally {
      if (generation === refreshGeneration.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => { refreshGeneration.current += 1 }
  }, [refresh])
  useEffect(() => setName(current.name), [current.name])

  const runOperation = async (operation: () => Promise<void>, errorKey: MessageKey) => {
    // The synchronous guard also covers two clicks before React updates disabled buttons.
    if (operationInFlight.current) return
    operationInFlight.current = true
    setUpdating(true)
    setOperationError(null)
    try {
      await operation()
    } catch {
      setOperationError(errorKey)
    } finally {
      operationInFlight.current = false
      setUpdating(false)
    }
  }

  const saveCopy = async () => {
    const timestamp = new Date().toISOString()
    const id = createId('stack')
    const document = { ...current, id, name: name.trim() || current.name, createdAt: timestamp, updatedAt: timestamp }
    const record = { id, name: document.name, document, createdAt: timestamp, updatedAt: timestamp }
    await saveNamedStack(record)
    // A completed write is still a saved copy even if the following list read fails.
    setStacks((previous) => [record, ...previous])
    await refresh()
    onNotice(translate(language, autosaveStatus === 'conflict' || autosaveStatus === 'error' ? 'savedCopyPaused' : 'savedCurrentBrowser'), 'success')
  }
  const busy = loading || updating

  const emptyMessage = autosaveStatus === 'idle'
    ? 'noNamedIdle'
    : autosaveStatus === 'conflict'
    ? 'noNamedConflict'
    : autosaveStatus === 'error'
      ? 'noNamedError'
      : autosaveStatus === 'saving'
        ? 'noNamedSaving'
        : autosaveStatus === 'pending' || autosaveStatus === 'checking'
          ? 'noNamedPending'
          : 'noNamedSaved'

  return (
    <div className="library-panel">
      <div className="panel-intro">
        <span className="eyebrow">{translate(language, 'localPersistence')}</span>
        <h2>{translate(language, 'library')}</h2>
        <p className="storage-disclosure">{translate(language, 'storedOnly')}</p>
      </div>

      <div className="save-stack-box">
        <label htmlFor="save-stack-name">{translate(language, 'nameStack')}</label>
        <div>
          <input id="save-stack-name" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
          <button type="button" className="primary-button" disabled={busy} onClick={() => void runOperation(saveCopy, 'namedSaveFailed')}>{translate(language, 'saveCopy')}</button>
        </div>
        <small>{translate(language, 'stackStorageNote')}</small>
      </div>

      <div className="saved-stack-heading"><span>{translate(language, 'savedStacks')}</span><button type="button" disabled={busy} onClick={() => void refresh()}>{translate(language, 'refresh')}</button></div>
      <div className="saved-stack-list" aria-busy={busy}>
        {operationError && <div className="empty-state compact" role="alert"><span>!</span><p>{translate(language, operationError)}</p></div>}
        {updating && <div className="empty-state compact" role="status"><span>··</span><p>{translate(language, 'namedWorking')}</p></div>}
        {loading && <div className="empty-state compact"><span>··</span><p>{translate(language, 'readingStorage')}</p></div>}
        {!loading && readFailed && <div className="empty-state compact" role="alert"><span>!</span><p>{translate(language, 'namedReadFailed')}</p></div>}
        {!loading && !readFailed && stacks.length === 0 && <div className="empty-state compact"><span>00</span><p>{translate(language, emptyMessage)}</p></div>}
        {stacks.map((stack) => (
          <article key={stack.id}>
            <button className="saved-stack-load" type="button" disabled={busy} onClick={() => onLoad(stack.document)}>
              <span className="saved-stack-glyph"><i /><i /><i /></span>
              <span><strong>{stack.name}</strong><small>{translate(language, 'stackSummary', { steps: stack.document.steps.length, date: formatDate(stack.updatedAt) })}</small></span>
              <em>{translate(language, 'open')}</em>
            </button>
            <div className="saved-stack-actions">
              <button type="button" disabled={busy} onClick={() => {
                const nextName = window.prompt(translate(language, 'renamePrompt'), stack.name)
                if (!nextName?.trim()) return
                void runOperation(async () => {
                  await renameSavedStack(stack.id, nextName)
                  await refresh()
                }, 'namedRenameFailed')
              }}>{translate(language, 'rename')}</button>
              <button type="button" className="danger-button" disabled={busy} onClick={() => {
                if (!window.confirm(translate(language, 'deletePrompt', { name: stack.name }))) return
                void runOperation(async () => {
                  await deleteSavedStack(stack.id)
                  setStacks((previous) => previous.filter((record) => record.id !== stack.id))
                  await refresh()
                }, 'namedDeleteFailed')
              }}>{translate(language, 'delete')}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
