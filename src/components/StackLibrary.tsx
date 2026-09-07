import { useCallback, useEffect, useState } from 'react'
import { createId, type FlowDocument } from '../domain/flow'
import {
  deleteSavedStack,
  listSavedStacks,
  renameSavedStack,
  saveNamedStack,
  type SavedStack,
} from '../persistence/indexed-db'
import type { AutosaveStatus, Language } from '../i18n'
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

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setStacks(await listSavedStacks())
    } catch {
      onNotice(translate(language, 'storageUnavailable'), 'warning')
    } finally {
      setLoading(false)
    }
  }, [language, onNotice])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => setName(current.name), [current.name])

  const saveCopy = async () => {
    const timestamp = new Date().toISOString()
    const id = createId('stack')
    const document = { ...current, id, name: name.trim() || current.name, createdAt: timestamp, updatedAt: timestamp }
    await saveNamedStack({ id, name: document.name, document, createdAt: timestamp, updatedAt: timestamp })
    await refresh()
    onNotice(translate(language, autosaveStatus === 'conflict' || autosaveStatus === 'error' ? 'savedCopyPaused' : 'savedCurrentBrowser'), 'success')
  }

  const emptyMessage = autosaveStatus === 'conflict'
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
          <input id="save-stack-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          <button type="button" className="primary-button" onClick={() => void saveCopy()}>{translate(language, 'saveCopy')}</button>
        </div>
        <small>{translate(language, 'stackStorageNote')}</small>
      </div>

      <div className="saved-stack-heading"><span>{translate(language, 'savedStacks')}</span><button type="button" onClick={() => void refresh()}>{translate(language, 'refresh')}</button></div>
      <div className="saved-stack-list">
        {loading && <div className="empty-state compact"><span>··</span><p>{translate(language, 'readingStorage')}</p></div>}
        {!loading && stacks.length === 0 && <div className="empty-state compact"><span>00</span><p>{translate(language, emptyMessage)}</p></div>}
        {stacks.map((stack) => (
          <article key={stack.id}>
            <button className="saved-stack-load" type="button" onClick={() => onLoad(stack.document)}>
              <span className="saved-stack-glyph"><i /><i /><i /></span>
              <span><strong>{stack.name}</strong><small>{translate(language, 'stackSummary', { steps: stack.document.steps.length, date: formatDate(stack.updatedAt) })}</small></span>
              <em>{translate(language, 'open')}</em>
            </button>
            <div className="saved-stack-actions">
              <button type="button" onClick={() => {
                const nextName = window.prompt(translate(language, 'renamePrompt'), stack.name)
                if (!nextName?.trim()) return
                void renameSavedStack(stack.id, nextName).then(refresh)
              }}>{translate(language, 'rename')}</button>
              <button type="button" className="danger-button" onClick={() => {
                if (!window.confirm(translate(language, 'deletePrompt', { name: stack.name }))) return
                void deleteSavedStack(stack.id).then(refresh)
              }}>{translate(language, 'delete')}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
