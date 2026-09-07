import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

async function openFreshWorkspace(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('simulator')).toBeVisible()
  await expect(page.locator('.startup-screen')).toBeHidden()
}

test('editing and preview stay aligned by step id through sequence changes', async ({ page }) => {
  await openFreshWorkspace(page)

  await page.getByRole('button', { name: /Etch/ }).last().click()
  await expect(page.locator('.view-caption strong')).toHaveText('Directional dielectric etch')
  await expect(page.locator('.timeline-count')).toHaveText('01 / 01')

  await page.getByRole('button', { name: /Deposition/ }).last().click()
  await expect(page.locator('.view-caption strong')).toHaveText('Conformal oxide deposition')
  await expect(page.locator('.timeline-count')).toHaveText('02 / 02')

  await page.locator('.step-card').filter({ hasText: 'Directional dielectric etch' }).locator('.step-card-header').click()
  const etchCard = page.locator('.step-card').filter({ hasText: 'Directional dielectric etch' })
  await expect(etchCard.getByText('The preview is showing a different process state.')).toBeVisible()
  await etchCard.getByRole('button', { name: 'Preview this step' }).click()
  await expect(page.locator('.view-caption strong')).toHaveText('Directional dielectric etch')
  await expect(page.locator('.timeline-count')).toHaveText('01 / 02')

  await etchCard.getByRole('button', { name: '↓' }).click()
  await expect(page.locator('.view-caption strong')).toHaveText('Directional dielectric etch')
  await expect(page.locator('.timeline-count')).toHaveText('02 / 02')
  await etchCard.locator('.switch-label').click()
  await expect(etchCard).toHaveClass(/disabled/)
  await expect(page.locator('.view-caption strong')).toHaveText('Directional dielectric etch')
  await etchCard.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.view-caption strong')).toHaveText('Conformal oxide deposition')
  await expect(page.locator('.timeline-count')).toHaveText('01 / 01')
})

test('numeric edits allow drafting and explain clamping on commit', async ({ page }) => {
  await openFreshWorkspace(page)
  await page.getByRole('button', { name: /Etch/ }).last().click()
  const depth = page.getByLabel('Etch depth numeric value')

  await depth.fill('')
  await expect(depth).toHaveValue('')
  await depth.fill('-10')
  await depth.press('Tab')
  await expect(depth).toHaveValue('2')
  await expect(page.getByText('Adjusted to 2 nm: the allowed range is 2–240 nm.')).toBeVisible()
  await expect(page.getByText(/Grid resolution: 2 nm per cell/).first()).toBeVisible()
})

test('WebGL creation failure never reports Ready and leaves 2D usable', async ({ context, page }) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return original.call(this, type as never, ...(args as []))
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await openFreshWorkspace(page)
  await page.getByRole('button', { name: /Etch/ }).last().click()
  await page.getByTestId('view-3d').click()

  await expect(page.getByText(/no working WebGL renderer|WebGL renderer could not be created/)).toBeVisible()
  await expect(page.getByText(/Ready in/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export PNG locally' })).toBeDisabled()
  await page.getByRole('button', { name: 'Return to 2D' }).click()
  await expect(page.locator('.cross-section-wrap canvas')).toBeVisible()
  await expect(page.locator('.view-caption strong')).toHaveText('Directional dielectric etch')
})

test('a presented 3D frame enables a non-empty PNG export', async ({ page }) => {
  await openFreshWorkspace(page)
  await page.getByRole('button', { name: /Etch/ }).last().click()
  await page.getByTestId('view-3d').click()
  await expect(page.getByText(/first frame presented/)).toBeVisible({ timeout: 20_000 })
  await page.locator('[aria-label="Interactive 3D film stack view"]').evaluate((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  })
  await expect(page.getByText(/WebGL context was lost/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export PNG locally' })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry 3D' }).click()
  await expect(page.getByText(/first frame presented/)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[aria-label="Interactive 3D film stack view"]')).toHaveCount(1)
  const exportButton = page.getByRole('button', { name: 'Export PNG locally' })
  await expect(exportButton).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const png = await readFile(path as string)
  expect(png.length).toBeGreaterThan(1_000)
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
})

test('storage write failure is reported as a stopped save', async ({ context, page }) => {
  await context.addInitScript(() => {
    indexedDB.open = (() => { throw new Error('Simulated storage failure') }) as typeof indexedDB.open
  })
  await openFreshWorkspace(page)
  await page.getByLabel('Flow name').fill('Unsaved draft')
  await expect(page.getByText('Autosave is unavailable. Export JSON to protect this work.')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText(/Browser storage only · save stopped/)).toBeVisible()
})

test('concurrent tabs keep a persistent conflict state and protect both drafts', async ({ context, page }, testInfo) => {
  await openFreshWorkspace(page)
  await page.getByLabel('Flow name').fill('Original draft')
  await expect(page.getByText(/Browser storage only · saved/)).toBeVisible({ timeout: 5_000 })

  const secondPage = await context.newPage()
  await secondPage.goto('/')
  await secondPage.getByRole('button', { name: 'Resume session' }).click()
  await expect(secondPage.getByRole('heading', { name: 'Original draft' })).toBeVisible()

  await page.getByLabel('Flow name').fill('Newer first-tab draft')
  await expect(page.getByText(/Browser storage only · saved/)).toBeVisible({ timeout: 5_000 })
  await secondPage.getByLabel('Flow name').fill('Conflicting second-tab draft')
  await expect(secondPage.getByText(/Another tab saved a newer draft/)).toBeVisible({ timeout: 5_000 })
  await expect(secondPage.getByText(/Browser storage only · autosave paused/)).toBeVisible()

  await secondPage.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(secondPage.getByText('A newer draft exists in another tab')).toBeVisible()
  await secondPage.getByLabel('Flow name').fill('Conflict edits still in memory')
  await secondPage.waitForTimeout(1_200)
  await expect(secondPage.getByText(/Browser storage only · autosave paused/)).toBeVisible()
  await expect(secondPage.getByText(/changes pending/)).toHaveCount(0)

  await secondPage.getByRole('button', { name: /Stacks/ }).click()
  await expect(secondPage.getByText('No named stacks yet. Autosave for this draft is paused; export it or load the newer draft.')).toBeVisible()
  await secondPage.screenshot({ path: testInfo.outputPath('autosave-conflict.png'), fullPage: true })

  const exportPromise = secondPage.waitForEvent('download')
  await secondPage.getByRole('button', { name: 'Export current work' }).click()
  const exported = await exportPromise
  const exportedPath = await exported.path()
  expect(exportedPath).not.toBeNull()
  const exportedDocument = JSON.parse(await readFile(exportedPath as string, 'utf8'))
  expect(exportedDocument.name).toBe('Conflict edits still in memory')

  await secondPage.getByRole('button', { name: '繁中' }).click()
  await expect(secondPage.getByText('另一分頁有較新的草稿')).toBeVisible()
  await expect(secondPage.getByText(/僅限瀏覽器儲存 · 自動儲存已暫停/)).toBeVisible()
  await expect(secondPage.getByText(/尚無具名堆疊；此草稿的自動儲存已暫停/)).toBeVisible()
  await secondPage.screenshot({ path: testInfo.outputPath('autosave-conflict-zh-TW.png'), fullPage: true })

  secondPage.once('dialog', (dialog) => dialog.accept())
  await secondPage.getByRole('button', { name: '載入較新草稿' }).click()
  await expect(secondPage.getByRole('heading', { name: 'Newer first-tab draft' })).toBeVisible()
  await expect(secondPage.getByText(/僅限瀏覽器儲存 · 已儲存/)).toBeVisible()
})

test('Traditional Chinese covers core editing, comparison, validation, storage, and WebGL recovery', async ({ context, page }, testInfo) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return original.call(this, type as never, ...(args as []))
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await openFreshWorkspace(page)
  const originalName = await page.getByLabel('Flow name').inputValue()
  await page.getByRole('button', { name: '繁中' }).click()
  await expect(page.getByLabel('流程名稱')).toHaveValue(originalName)
  await page.getByRole('button', { name: /蝕刻（Etch）/ }).click()

  const depth = page.getByLabel('蝕刻深度數值')
  await depth.fill('-10')
  await depth.press('Tab')
  await expect(depth).toHaveValue('2')
  await expect(page.getByText('已調整為 2 nm：允許範圍為 2–240 nm。')).toBeVisible()
  await expect(page.getByText(/網格解析度：每格 2 nm/).first()).toBeVisible()
  await page.getByRole('button', { name: '關於命令深度' }).click()
  await expect(page.getByText('名目蝕刻深度')).toBeVisible()
  await expect(page.getByText(/幾何負載與選擇比修正前/)).toBeVisible()

  await page.getByRole('tab', { name: /前後比較/ }).click()
  const comparison = page.getByLabel('前一步與目前步驟的製程比較')
  await expect(comparison.getByText('前一步')).toBeVisible()
  await expect(comparison.getByText('目前步驟')).toBeVisible()
  await expect(comparison.getByText(/移除 \d+/)).toBeVisible()

  await page.locator('.side-tabs').getByRole('button', { name: /堆疊/ }).click()
  await expect(page.getByText(/尚無具名堆疊/)).toBeVisible()
  await page.getByRole('tab', { name: /3D 視圖/ }).click()
  await expect(page.getByText(/無法建立 WebGL 渲染器|沒有可用的 WebGL 渲染器/)).toBeVisible()
  await expect(page.getByRole('button', { name: '在本機匯出 PNG' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '返回 2D 剖面' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重試 3D' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('traditional-chinese-core.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const returnButton = page.getByRole('button', { name: '返回 2D 剖面' })
  await expect(returnButton).toBeVisible()
  const recoveryIsInsideViewer = await returnButton.evaluate((button) => {
    const viewer = button.closest('.three-viewer')
    if (!viewer) return false
    const buttonRect = button.getBoundingClientRect()
    const viewerRect = viewer.getBoundingClientRect()
    return buttonRect.top >= viewerRect.top && buttonRect.bottom <= viewerRect.bottom
  })
  expect(recoveryIsInsideViewer).toBe(true)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('traditional-chinese-phone.png'), fullPage: true })
})

test('core 2D workspace remains usable at desktop and phone widths', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openFreshWorkspace(page)
  await page.getByRole('button', { name: /Etch/ }).last().click()
  await expect(page.locator('.cross-section-wrap canvas')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('desktop-workspace.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('view-2d')).toBeVisible()
  await expect(page.locator('.cross-section-wrap canvas')).toBeVisible()
  await expect(page.getByLabel('Process playback position')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('phone-workspace.png'), fullPage: true })
})

test('before/after comparison, material selection, and metric definitions use current snapshots', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openFreshWorkspace(page)
  await page.getByRole('button', { name: /Etch/ }).last().click()
  await page.getByTestId('view-compare').click()

  const comparison = page.getByLabel('Previous and current process comparison')
  await expect(comparison).toBeVisible()
  await expect(comparison.getByText('Base stack', { exact: true })).toBeVisible()
  await expect(comparison.getByText('Directional dielectric etch', { exact: true })).toBeVisible()
  await expect(comparison.getByText(/Removed [1-9]\d*/)).toBeVisible()

  const currentCanvas = comparison.getByLabel('Material cross-section after Directional dielectric etch')
  const bounds = await currentCanvas.boundingBox()
  expect(bounds).not.toBeNull()
  await currentCanvas.click({ position: { x: Math.round((bounds?.width ?? 400) * 0.25), y: Math.round((bounds?.height ?? 400) * 0.82) } })
  const inspector = comparison.getByLabel('Selected material details')
  await expect(inspector).toBeVisible()
  await expect(inspector.getByText(/Local remaining thickness/)).toBeVisible()
  await expect(inspector.getByText(/Cell provenance is not stored in schema v3/)).toBeVisible()

  await page.getByRole('button', { name: /ETCHED DEPTH/ }).click()
  await expect(page.getByText(/not commanded depth and not a sum/)).toBeVisible()
  await page.getByRole('button', { name: /MASK-OPEN COLUMNS/ }).click()
  await expect(page.getByText(/describes the mask, not whether the material surface is physically open/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('comparison-and-measurement.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(comparison.locator('canvas')).toHaveCount(2)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('via landed area opens the exact top-down raster measurement', async ({ page }) => {
  await page.goto('/?preset=borderless-via-margin')
  await expect(page.getByTestId('simulator')).toBeVisible()
  await page.getByRole('button', { name: /VIA LANDED AREA/ }).click()
  await page.getByRole('button', { name: 'Show exact top-down cells' }).click()
  await expect(page.getByLabel('Via landed-area measurement overlay')).toBeVisible()
  await expect(page.locator('.layout-measurement-note')).toContainText(/\d+ \/ \d+ nominal via cells/)
})
