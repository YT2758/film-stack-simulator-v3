import { expect, test, type Page } from '@playwright/test'

interface LibraryFaults {
  failReads: boolean
  failWrites: boolean
  delayReadsMs: number
}

async function installLibraryFaults(page: Page) {
  await page.addInitScript(() => {
    const faults = { failReads: false, failWrites: false, delayReadsMs: 0 }
    Object.assign(window, { libraryFaults: faults })
    const originalGetAll = IDBObjectStore.prototype.getAll
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name !== 'stacks') return originalGetAll.apply(this, args)
      if (faults.failReads) throw new DOMException('Simulated list failure', 'UnknownError')
      const request = originalGetAll.apply(this, args)
      if (!faults.delayReadsMs) return request
      // Delay delivery, not the real IndexedDB transaction or its persisted result.
      const delayed = { result: undefined, error: null, onsuccess: null, onerror: null } as unknown as IDBRequest
      request.onsuccess = () => {
        Object.assign(delayed, { result: request.result })
        setTimeout(() => delayed.onsuccess?.call(delayed, new Event('success')), faults.delayReadsMs)
      }
      request.onerror = () => {
        Object.assign(delayed, { error: request.error })
        delayed.onerror?.call(delayed, new Event('error'))
      }
      return delayed
    }
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'stacks' && faults.failWrites) throw new DOMException('Simulated write failure', 'QuotaExceededError')
      return originalPut.apply(this, args)
    }
    const originalDelete = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === 'stacks' && faults.failWrites) throw new DOMException('Simulated delete failure', 'UnknownError')
      return originalDelete.apply(this, args)
    }
  })
}

async function setFaults(page: Page, faults: Partial<LibraryFaults>) {
  await page.evaluate((next) => {
    Object.assign((window as unknown as { libraryFaults: LibraryFaults }).libraryFaults, next)
  }, faults)
}

async function openLibrary(page: Page) {
  await page.goto('/')
  await expect(page.locator('.startup-screen')).toBeHidden()
  await page.locator('.side-tabs').getByRole('button', { name: /Stacks/ }).click()
  await expect(page.getByText('Reading browser storage…')).toBeHidden()
}

async function readNamedStacks(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('film-stack-simulator-v3', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      // Cursor verification is independent of the getAll fault injected above.
      const cursor = db.transaction('stacks', 'readonly').objectStore('stacks').openCursor()
      return await new Promise<Array<{ name: string; document: { name: string } }>>((resolve, reject) => {
        const records: Array<{ name: string; document: { name: string } }> = []
        cursor.onsuccess = () => {
          if (!cursor.result) return resolve(records)
          records.push(cursor.result.value)
          cursor.result.continue()
        }
        cursor.onerror = () => reject(cursor.error)
      })
    } finally {
      db.close()
    }
  })
}

test('failed library reads show unknown state, preserve known copies, and recover on refresh', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installLibraryFaults(page)
  await openLibrary(page)
  const library = page.locator('.library-panel')
  await setFaults(page, { failReads: true })
  await library.getByRole('button', { name: 'Refresh' }).click()
  await expect(library.getByRole('alert')).toHaveText(/Could not read saved stacks/)
  await expect(library.getByText(/No named stacks yet/)).toHaveCount(0)

  // A successful write must remain distinguishable from the failed follow-up read.
  await library.getByLabel('Name this stack').fill('Protected named copy')
  await library.getByRole('button', { name: 'Save a copy' }).click()
  await expect(library.locator('article')).toHaveCount(1)
  await expect(library.getByRole('alert')).toHaveText(/Could not read saved stacks/)
  expect((await readNamedStacks(page)).map((record) => record.name)).toEqual(['Protected named copy'])
  await setFaults(page, { failReads: false })
  await library.getByRole('button', { name: 'Refresh' }).click()
  await expect(library.getByRole('alert')).toHaveCount(0)
  await expect(library.locator('article strong')).toHaveText('Protected named copy')
  expect(errors).toEqual([])
})

test('named save, rename, and delete failures are handled and do not report false success', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installLibraryFaults(page)
  await openLibrary(page)
  const library = page.locator('.library-panel')
  await library.getByLabel('Name this stack').fill('Original named copy')
  await setFaults(page, { failWrites: true })
  await library.getByRole('button', { name: 'Save a copy' }).click()
  await expect(library.getByRole('alert')).toHaveText(/The named copy could not be saved/)
  expect(await readNamedStacks(page)).toEqual([])
  await expect(page.getByText('Saved in this browser only.', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '繁中', exact: true }).click()
  await expect(library.getByRole('alert')).toHaveText(/無法儲存具名副本/)
  await page.getByRole('button', { name: 'EN', exact: true }).click()

  await setFaults(page, { failWrites: false })
  await library.getByRole('button', { name: 'Save a copy' }).click()
  await expect(library.locator('article strong')).toHaveText('Original named copy')
  await setFaults(page, { failWrites: true })
  page.once('dialog', (dialog) => dialog.accept('Renamed copy'))
  await library.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(library.getByRole('alert')).toHaveText(/could not be renamed/)
  expect((await readNamedStacks(page)).map((record) => record.name)).toEqual(['Original named copy'])
  page.once('dialog', (dialog) => dialog.accept())
  await library.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(library.getByRole('alert')).toHaveText(/could not be deleted/)
  expect((await readNamedStacks(page)).map((record) => record.name)).toEqual(['Original named copy'])

  await setFaults(page, { failWrites: false })
  page.once('dialog', (dialog) => dialog.accept('Renamed copy'))
  await library.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(library.locator('article strong')).toHaveText('Renamed copy')
  const renamed = await readNamedStacks(page)
  expect(renamed[0].document.name).toBe('Renamed copy')
  page.once('dialog', (dialog) => dialog.accept())
  await library.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(library.locator('article')).toHaveCount(0)
  expect(await readNamedStacks(page)).toEqual([])
  expect(errors).toEqual([])
})

test('a pending named save blocks repeated submissions until its refresh completes', async ({ page }) => {
  await installLibraryFaults(page)
  await openLibrary(page)
  const library = page.locator('.library-panel')
  await library.getByLabel('Name this stack').fill('Only one copy')
  await setFaults(page, { delayReadsMs: 800 })
  const save = library.getByRole('button', { name: 'Save a copy' })
  await save.evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(save).toBeDisabled()
  await expect(library.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  await expect(library.getByText('Updating browser storage…')).toBeVisible()
  await expect(save).toBeEnabled()
  await expect(library.locator('article')).toHaveCount(1)
  expect((await readNamedStacks(page)).map((record) => record.name)).toEqual(['Only one copy'])
})
