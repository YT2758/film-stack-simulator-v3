import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { createBlankFlow } from '../src/domain/defaults'
import { encodeFlowFragment } from '../src/persistence/share-codec'
import { randomBytes } from 'node:crypto'

async function readDraft(page: Page) {
  return page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open('film-stack-simulator-v3', 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const request = database.transaction('meta').objectStore('meta').get('last-session')
      request.onerror = () => { database.close(); reject(request.error) }
      request.onsuccess = () => { database.close(); resolve(request.result) }
    }
  }))
}

async function writeDraft(page: Page, value: unknown) {
  await page.evaluate((record) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('film-stack-simulator-v3', 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const database = open.result
      const transaction = database.transaction('meta', 'readwrite')
      transaction.objectStore('meta').put(record, 'last-session')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
    }
  }), value)
}

test('blocked language preference storage never blanks the workspace', async ({ context, page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('Blocked', 'SecurityError') } })
  })
  await page.goto('/')
  await expect(page.getByTestId('simulator')).toBeVisible()
  await page.getByRole('button', { name: '繁中' }).click()
  await expect(page.getByLabel('流程名稱')).toBeVisible()
  await page.getByLabel('流程名稱').fill('仍可使用')
  await expect(page.locator('.sidebar-disclosure')).toContainText('已儲存')
  expect(errors).toEqual([])
})

test('initial draft read failure is visible before editing and handled without uncaught errors', async ({ context, page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.addInitScript(() => {
    indexedDB.open = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.goto('/')
  await expect(page.getByTestId('simulator')).toBeVisible()
  await expect(page.locator('.sidebar-disclosure')).toContainText('save stopped')
  await expect(page.locator('.save-recovery')).toContainText('not protected in browser storage')
  await expect(page.locator('.sidebar-disclosure')).not.toContainText('saved')
  await page.getByLabel('Flow name').fill('Keep working without storage')
  await expect(page.getByRole('heading', { name: 'Keep working without storage' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a corrupt draft is reported and never treated as an absent draft', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('simulator')).toBeVisible()
  const corrupt = { kind: 'film-stack-last-session', version: 1, revision: 0, document: { recovery: 'keep these bytes' } }
  await writeDraft(page, corrupt)
  await page.reload()
  await expect(page.locator('.sidebar-disclosure')).toContainText('save stopped')
  await page.getByLabel('Flow name').fill('Edits must not overwrite corrupted storage')
  await page.getByRole('button', { name: 'Retry autosave' }).click()
  await expect(page.locator('.sidebar-disclosure')).toContainText('save stopped')
  expect(await readDraft(page)).toEqual(corrupt)
})

test('delayed draft initialization gates editing and start fresh does not erase a draft', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Flow name').fill('Protected existing draft')
  await expect(page.locator('.sidebar-disclosure')).toContainText('saved')
  const saved = await readDraft(page)
  await page.addInitScript(() => {
    const original = indexedDB.open.bind(indexedDB)
    indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => {
      const request = original(...args)
      Object.defineProperty(request, 'onsuccess', {
        set(handler: (event: Event) => void) {
          request.addEventListener('success', event => setTimeout(() => handler.call(request, event), 800))
        },
      })
      return request
    }) as IDBFactory['open']
  })
  await page.reload()
  await expect(page.locator('.startup-screen')).toBeVisible()
  await expect(page.getByLabel('Flow name')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.locator('main').evaluate(main => main.inert)).toBe(true)
  await page.getByRole('button', { name: 'Start fresh' }).click()
  await expect(page.locator('.sidebar-disclosure')).toContainText('not saved yet')
  await page.waitForTimeout(1_500)
  expect(await readDraft(page)).toEqual(saved)
  await page.reload()
  await expect(page.getByRole('dialog')).toContainText('Protected existing draft')
  await page.getByRole('button', { name: 'Resume session' }).click()
  await expect(page.getByLabel('Flow name')).toHaveValue('Protected existing draft')
})

test('raw v3 drafts remain readable without rewriting them at startup', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('simulator')).toBeVisible()
  const legacy = { ...createBlankFlow(), name: 'Legacy raw v3 draft' }
  await writeDraft(page, legacy)
  await page.reload()
  await page.getByRole('button', { name: 'Resume session' }).click()
  await expect(page.getByLabel('Flow name')).toHaveValue(legacy.name)
  expect(await readDraft(page)).toEqual(legacy)
  await page.getByLabel('Flow name').fill('Migrated after editing')
  await expect(page.locator('.sidebar-disclosure')).toContainText('saved')
  expect(await readDraft(page)).toMatchObject({
    kind: 'film-stack-last-session', version: 1, revision: 1,
    document: { schemaVersion: 3, name: 'Migrated after editing' },
  })
})

test('JSON replacement can be canceled and accepted imports round-trip exactly', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Flow name').fill('Current work to protect')
  await page.getByRole('button', { name: /Etch/ }).last().click()
  const imported = { ...createBlankFlow(), name: 'Imported example' }
  const upload = () => page.locator('input[type="file"]').setInputFiles({
    name: 'example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)),
  })
  page.once('dialog', dialog => dialog.dismiss())
  await upload()
  await expect(page.getByLabel('Flow name')).toHaveValue('Current work to protect')
  await expect(page.locator('.step-card')).toHaveCount(1)
  page.once('dialog', dialog => dialog.accept())
  await upload()
  await expect(page.getByLabel('Flow name')).toHaveValue(imported.name)
  await expect(page.locator('.timeline-count')).toHaveText('00 / 00')
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-json').click()
  const file = await (await downloadPromise).path()
  expect(JSON.parse(await readFile(file!, 'utf8'))).toEqual(imported)
})

test('unsaved work warns before leaving the page and remains after cancellation', async ({ context, page }) => {
  await context.addInitScript(() => { indexedDB.open = () => { throw new Error('Storage unavailable') } })
  await page.goto('/')
  await page.getByLabel('Flow name').fill('Do not lose this work')
  const dialogPromise = page.waitForEvent('dialog')
  const navigation = page.getByRole('link', { name: 'Case studies', exact: true }).click()
  const dialog = await dialogPromise
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  await navigation
  await expect(page.getByLabel('Flow name')).toHaveValue('Do not lose this work')
  await expect(page.getByTestId('export-json')).toBeEnabled()
})

test('share restoration takes priority over preset and preserves the existing draft', async ({ context, page }) => {
  await page.goto('/')
  await page.getByLabel('Flow name').fill('Keep the original draft')
  await expect(page.locator('.sidebar-disclosure')).toContainText('saved')
  const saved = await readDraft(page)
  const shared = { ...createBlankFlow(), name: 'Shared geometry', layout: { ...createBlankFlow().layout, cutPosition: 0.25 } }
  const sharedPage = await context.newPage()
  await sharedPage.goto('/?preset=arde-demo#' + encodeFlowFragment(shared))
  await expect(sharedPage.getByLabel('Flow name')).toHaveValue('Shared geometry')
  await expect(sharedPage.locator('.view-caption')).toContainText('Cut Y 25%')
  await expect(sharedPage.getByRole('dialog')).toHaveCount(0)
  await expect(sharedPage.locator('.sidebar-disclosure')).toContainText('not saved yet')
  expect(await readDraft(sharedPage)).toEqual(saved)
  await sharedPage.getByLabel('Flow name').fill('Shared work edited here')
  await expect(sharedPage.locator('.save-recovery')).toContainText('A newer draft exists')
  expect(await readDraft(sharedPage)).toEqual(saved)
})

test('oversized share reports a recovery action without uncaught errors or changing the URL', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const oversized = { ...createBlankFlow(), name: 'Large but valid JSON', description: randomBytes(130_000).toString('base64') }
  page.once('dialog', dialog => dialog.accept())
  await page.locator('input[type="file"]').setInputFiles({
    name: 'large.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oversized)),
  })
  await expect(page.getByLabel('Flow name')).toHaveValue(oversized.name)
  const originalUrl = page.url()
  await page.getByRole('button', { name: 'Copy share link' }).click()
  await expect(page.getByText('This flow could not be encoded as a reliable share link. Export JSON to share or keep a copy.')).toBeVisible()
  expect(page.url()).toBe(originalUrl)
  await expect(page.getByTestId('export-json')).toBeEnabled()
  expect(errors).toEqual([])
})
