import { useCallback, useEffect, useState } from 'react'
import { createId, type FlowDocument } from '../domain/flow'
import {
  deleteSavedStack,
  listSavedStacks,
  renameSavedStack,
  saveNamedStack,
  type SavedStack,
} from '../persistence/indexed-db'
import type { Language } from '../i18n'
import { translate } from '../i18n'

interface StackLibraryProps {
  current: FlowDocument
  language: Language
  onLoad: (document: FlowDocument) => void
  onNotice: (message: string, tone?: 'success' | 'warning') => void
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function StackLibrary({ current, language, onLoad, onNotice }: StackLibraryProps) {
  const [stacks, setStacks] = useState<SavedStack[]>([])
  const [name, setName] = useState(current.name)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setStacks(await listSavedStacks())
    } catch {
      onNotice('Browser storage is unavailable. Export JSON to keep a copy.', 'warning')
    } finally {
      setLoading(false)
    }
  }, [onNotice])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => setName(current.name), [current.name])

  const saveCopy = async () => {
    const timestamp = new Date().toISOString()
    const id = createId('stack')
    const document = { ...current, id, name: name.trim() || current.name, createdAt: timestamp, updatedAt: timestamp }
    await saveNamedStack({ id, name: document.name, document, createdAt: timestamp, updatedAt: timestamp })
    await refresh()
    onNotice('Saved in this browser only.', 'success')
  }

  return (
    <div className="library-panel">
      <div className="panel-intro">
        <span className="eyebrow">Local-first persistence</span>
        <h2>{translate(language, 'library')}</h2>
        <p className="storage-disclosure">{translate(language, 'storedOnly')}</p>
      </div>

      <div className="save-stack-box">
        <label htmlFor="save-stack-name">Name this stack</label>
        <div>
          <input id="save-stack-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          <button type="button" className="primary-button" onClick={() => void saveCopy()}>{translate(language, 'saveCopy')}</button>
        </div>
        <small>IndexedDB · 1 second local autosave · no account</small>
      </div>

      <div className="saved-stack-heading"><span>Saved stacks</span><button type="button" onClick={() => void refresh()}>Refresh</button></div>
      <div className="saved-stack-list">
        {loading && <div className="empty-state compact"><span>··</span><p>Reading browser storage…</p></div>}
        {!loading && stacks.length === 0 && <div className="empty-state compact"><span>00</span><p>No named stacks yet. Autosave is still keeping your current draft.</p></div>}
        {stacks.map((stack) => (
          <article key={stack.id}>
            <button className="saved-stack-load" type="button" onClick={() => onLoad(stack.document)}>
              <span className="saved-stack-glyph"><i /><i /><i /></span>
              <span><strong>{stack.name}</strong><small>{stack.document.steps.length} steps · {formatDate(stack.updatedAt)}</small></span>
              <em>Open →</em>
            </button>
            <div className="saved-stack-actions">
              <button type="button" onClick={() => {
                const nextName = window.prompt('Rename this local stack', stack.name)
                if (!nextName?.trim()) return
                void renameSavedStack(stack.id, nextName).then(refresh)
              }}>Rename</button>
              <button type="button" className="danger-button" onClick={() => {
                if (!window.confirm(`Delete “${stack.name}” from this browser? Export it first if you may need it.`)) return
                void deleteSavedStack(stack.id).then(refresh)
              }}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
