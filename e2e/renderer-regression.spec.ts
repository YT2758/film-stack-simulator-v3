import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

async function open3D(page: Page) {
  await page.goto('/')
  await expect(page.locator('.startup-screen')).toBeHidden()
  await page.getByRole('button', { name: /Etch/ }).last().click()
  await page.getByTestId('view-3d').click()
}

async function scenePixels(page: Page) {
  return page.locator('.three-viewer canvas').evaluate((element) => {
    const source = element as HTMLCanvasElement
    const sample = document.createElement('canvas')
    sample.width = sample.height = 96
    const context = sample.getContext('2d')!
    context.drawImage(source, 0, 0, 96, 96)
    const pixels = context.getImageData(0, 0, 96, 96).data
    const colors = new Set<number>()
    let foreground = 0
    let hash = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue] = pixels.slice(index, index + 3)
      if (Math.abs(red - 7) + Math.abs(green - 17) + Math.abs(blue - 31) > 24) foreground += 1
      colors.add((red >> 4) * 256 + (green >> 4) * 16 + (blue >> 4))
      hash = (Math.imul(hash, 31) + red * 65_536 + green * 256 + blue) | 0
    }
    return { foreground, colors: colors.size, hash }
  })
}

async function expectVisibleGeometry(page: Page) {
  await expect.poll(async () => (await scenePixels(page)).foreground).toBeGreaterThan(500)
  expect((await scenePixels(page)).colors).toBeGreaterThan(8)
}

test('language switches preserve the rendered scene and PNG matches the current camera', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await open3D(page)
  await expect(page.getByText(/first frame presented/)).toBeVisible({ timeout: 20_000 })
  await expectVisibleGeometry(page)
  const beforeOrbit = await scenePixels(page)
  const canvas = page.locator('.three-viewer canvas')
  await canvas.evaluate((element) => element.setAttribute('data-renderer-instance', 'original'))
  const bounds = (await canvas.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.55, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await scenePixels(page)).hash).not.toBe(beforeOrbit.hash)
  await expectVisibleGeometry(page)

  await page.getByRole('button', { name: '繁中' }).click()
  await expect(page.getByText(/第一幀已/)).toBeVisible()
  await expect(canvas).toHaveAttribute('data-renderer-instance', 'original')
  await expect(canvas).toHaveAttribute('aria-label', '互動式 3D 膜層堆疊視圖')
  await expectVisibleGeometry(page)
  // Capture the frame at toBlob time; orbit damping may still move the camera afterward.
  await canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement & { pngReferencePixels?: Uint8ClampedArray }
    const toBlob = source.toBlob
    source.toBlob = function (callback, type, quality) {
      const sample = document.createElement('canvas')
      sample.width = source.width
      sample.height = source.height
      const context = sample.getContext('2d')!
      context.drawImage(source, 0, 0)
      source.pngReferencePixels = context.getImageData(0, 0, source.width, source.height).data
      toBlob.call(this, callback, type, quality)
    }
  })
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '在本機匯出 PNG' }).click()
  const png = await readFile((await (await downloading).path())!)
  const comparison = await canvas.evaluate(async (element, encoded) => {
    const source = element as HTMLCanvasElement & { pngReferencePixels?: Uint8ClampedArray }
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    const exported = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const sample = document.createElement('canvas')
    sample.width = source.width
    sample.height = source.height
    const context = sample.getContext('2d')!
    const displayedPixels = source.pngReferencePixels!
    context.drawImage(exported, 0, 0)
    const exportedPixels = context.getImageData(0, 0, source.width, source.height).data
    let differentPixels = 0
    for (let index = 0; index < displayedPixels.length; index += 4) {
      if ([0, 1, 2, 3].some((channel) => Math.abs(displayedPixels[index + channel] - exportedPixels[index + channel]) > 3)) differentPixels += 1
    }
    const result = { differentPixels, width: exported.width, height: exported.height, canvasWidth: source.width, canvasHeight: source.height }
    exported.close()
    return result
  }, png.toString('base64'))
  expect(comparison.width).toBe(comparison.canvasWidth)
  expect(comparison.height).toBe(comparison.canvasHeight)
  expect(comparison.differentPixels).toBeLessThan(96)
  await canvas.screenshot({ path: testInfo.outputPath('3d-orbit-chinese.png') })

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-renderer-instance', 'original')
  await expect(page.getByText(/first frame presented/)).toBeVisible()
})

test('a real lost WebGL context retries with fitted geometry, not an empty ready canvas', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await open3D(page)
  await expect(page.getByText(/first frame presented/)).toBeVisible({ timeout: 20_000 })
  await expectVisibleGeometry(page)
  const supportsLoss = await page.locator('.three-viewer canvas').evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('webgl2')
    const extension = context?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    extension.loseContext()
    return true
  })
  test.skip(!supportsLoss, 'This browser cannot inject a real WebGL context loss; verify it manually with WEBGL_lose_context.')
  await expect(page.getByText(/WebGL context was lost/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export PNG locally' })).toBeDisabled()
  await page.getByRole('button', { name: '繁中' }).click()
  await expect(page.getByText(/WebGL context 已遺失/)).toBeVisible()
  await expect(page.getByRole('button', { name: '在本機匯出 PNG' })).toBeDisabled()
  await page.getByRole('button', { name: '重試 3D' }).click()
  await expect(page.getByText(/第一幀已/)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.three-viewer canvas')).toHaveCount(1)
  await expectVisibleGeometry(page)
  await page.locator('.three-viewer canvas').screenshot({ path: testInfo.outputPath('3d-real-context-retry.png') })
})

for (const failure of ['creation', 'runtime'] as const) {
  test(`a ${failure} worker failure remains recoverable without leaving 3D`, async ({ context, page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await context.addInitScript((failureMode) => {
      const OriginalWorker = window.Worker
      let builds = 0
      window.Worker = class extends OriginalWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          const isFirst = builds++ === 0
          if (isFirst && failureMode === 'creation') throw new Error('Injected worker creation failure')
          super(url, options)
          if (isFirst && failureMode === 'runtime') {
            this.postMessage = () => { this.dispatchEvent(new ErrorEvent('error', { message: 'Injected worker runtime failure', cancelable: true })) }
          }
        }
      }
    }, failure)
    await open3D(page)
    await expect(page.getByText(/Injected worker (creation|runtime) failure/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export PNG locally' })).toBeDisabled()
    await page.getByRole('button', { name: 'Retry 3D' }).click()
    await expect(page.getByText(/first frame presented/)).toBeVisible({ timeout: 20_000 })
    await expectVisibleGeometry(page)
    expect(pageErrors).toEqual([])
  })
}
