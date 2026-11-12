import type { QueueItem } from './queue'

const DB_NAME = 'chicken-joo'
const STORE = 'queue'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listQueue(): Promise<QueueItem[]> {
  const db = await openDb()
  const items = await requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())
  db.close()
  return (items as QueueItem[]).sort((a, b) => a.createdAt - b.createdAt)
}

export async function putQueue(item: QueueItem): Promise<void> {
  const db = await openDb()
  await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(item))
  db.close()
}

export async function removeQueue(id: string): Promise<void> {
  const db = await openDb()
  await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id))
  db.close()
}
