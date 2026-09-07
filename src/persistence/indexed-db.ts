import type { FlowDocument } from '../domain/flow'
import { validateFlowDocument } from './flow-codec'

const DB_NAME = 'film-stack-simulator-v3'
const DB_VERSION = 1
const STACK_STORE = 'stacks'
const META_STORE = 'meta'
const LAST_SESSION_KEY = 'last-session'

export interface LastSessionRecord {
  kind: 'film-stack-last-session'
  version: 1
  document: FlowDocument
  revision: number
  writerId: string
  savedAt: string
}

export class DraftConflictError extends Error {
  constructor() {
    super('Another tab saved a newer draft. This tab stopped autosaving to avoid overwriting it.')
    this.name = 'DraftConflictError'
  }
}

export interface SavedStack {
  id: string
  name: string
  document: FlowDocument
  createdAt: string
  updatedAt: string
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STACK_STORE)) database.createObjectStore(STACK_STORE, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'))
  })
}

export async function listSavedStacks(): Promise<SavedStack[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STACK_STORE, 'readonly')
    const records = await requestResult(transaction.objectStore(STACK_STORE).getAll() as IDBRequest<SavedStack[]>)
    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  } finally {
    database.close()
  }
}

export async function saveNamedStack(record: SavedStack): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STACK_STORE, 'readwrite')
    transaction.objectStore(STACK_STORE).put({ ...record, document: validateFlowDocument(record.document) })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function deleteSavedStack(id: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STACK_STORE, 'readwrite')
    transaction.objectStore(STACK_STORE).delete(id)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function renameSavedStack(id: string, name: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STACK_STORE, 'readwrite')
    const store = transaction.objectStore(STACK_STORE)
    const record = await requestResult(store.get(id) as IDBRequest<SavedStack | undefined>)
    if (!record) throw new Error('The saved stack no longer exists.')
    const nextName = name.trim() || record.name
    const updatedAt = new Date().toISOString()
    store.put({
      ...record,
      name: nextName,
      document: validateFlowDocument({ ...record.document, name: nextName, updatedAt }),
      updatedAt,
    })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

function asLastSessionRecord(value: unknown): LastSessionRecord | null {
  if (!value) return null
  if (typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'film-stack-last-session') {
    const candidate = value as Partial<LastSessionRecord>
    if (candidate.version !== 1 || !Number.isInteger(candidate.revision) || (candidate.revision ?? -1) < 1) return null
    const document = validateFlowDocument(candidate.document)
    return {
      kind: 'film-stack-last-session',
      version: 1,
      document,
      revision: candidate.revision as number,
      writerId: typeof candidate.writerId === 'string' ? candidate.writerId : 'unknown-writer',
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : document.updatedAt,
    }
  }
  const document = validateFlowDocument(value)
  return {
    kind: 'film-stack-last-session',
    version: 1,
    document,
    revision: 0,
    writerId: 'legacy-writer',
    savedAt: document.updatedAt,
  }
}

export async function setLastSession(
  document: FlowDocument,
  options: { writerId?: string; expectedRevision?: number | null } = {},
): Promise<LastSessionRecord> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(META_STORE, 'readwrite')
    const store = transaction.objectStore(META_STORE)
    const currentValue = await requestResult(store.get(LAST_SESSION_KEY))
    const current = asLastSessionRecord(currentValue)
    if (options.expectedRevision === null && current !== null) throw new DraftConflictError()
    if (typeof options.expectedRevision === 'number' && current?.revision !== options.expectedRevision) throw new DraftConflictError()
    const record: LastSessionRecord = {
      kind: 'film-stack-last-session',
      version: 1,
      document: validateFlowDocument(document),
      revision: (current?.revision ?? 0) + 1,
      writerId: options.writerId ?? 'unknown-writer',
      savedAt: new Date().toISOString(),
    }
    store.put(record, LAST_SESSION_KEY)
    await transactionDone(transaction)
    return record
  } finally {
    database.close()
  }
}

export async function getLastSessionRecord(): Promise<LastSessionRecord | null> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(META_STORE, 'readonly')
    const value = await requestResult(transaction.objectStore(META_STORE).get(LAST_SESSION_KEY))
    return asLastSessionRecord(value)
  } catch {
    return null
  } finally {
    database.close()
  }
}

export async function getLastSession(): Promise<FlowDocument | null> {
  return (await getLastSessionRecord())?.document ?? null
}
