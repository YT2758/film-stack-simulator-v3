import type { FlowDocument } from '../domain/flow'
import { validateFlowDocument } from './flow-codec'

const DB_NAME = 'film-stack-simulator-v3'
const DB_VERSION = 1
const STACK_STORE = 'stacks'
const META_STORE = 'meta'
const LAST_SESSION_KEY = 'last-session'

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

export async function setLastSession(document: FlowDocument): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(META_STORE, 'readwrite')
    transaction.objectStore(META_STORE).put(validateFlowDocument(document), LAST_SESSION_KEY)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function getLastSession(): Promise<FlowDocument | null> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(META_STORE, 'readonly')
    const value = await requestResult(transaction.objectStore(META_STORE).get(LAST_SESSION_KEY))
    return value ? validateFlowDocument(value) : null
  } catch {
    return null
  } finally {
    database.close()
  }
}
