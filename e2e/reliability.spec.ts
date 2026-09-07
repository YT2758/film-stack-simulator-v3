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

test('concurrent tabs stop instead of overwriting a newer draft revision', async ({ context, page }) => {
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
  await expect(secondPage.getByText(/Browser storage only · save stopped/)).toBeVisible()
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
