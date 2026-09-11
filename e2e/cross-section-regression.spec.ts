import { expect, test } from '@playwright/test'

test('ARDE Y-axis unit does not overlap its highest tick label', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      const [text, x, y] = args
      if (text === 'nm' || text === '240') {
        const metrics = this.measureText(text)
        const canvas = this.canvas as HTMLCanvasElement & { axisText?: Record<string, { top: number; bottom: number }> }
        canvas.axisText ??= {}
        canvas.axisText[text] = { top: y - metrics.actualBoundingBoxAscent, bottom: y + metrics.actualBoundingBoxDescent }
      }
      return fillText.apply(this, args)
    }
  })
  await page.goto('/?preset=arde-demo')
  const canvas = page.locator('.cross-section-wrap canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement & { axisText?: Record<string, { top: number; bottom: number }> }) => {
    return Boolean(element.axisText?.nm && element.axisText['240'] && element.axisText.nm.bottom < element.axisText['240'].top)
  })).toBe(true)
  await page.locator('.visualization-shell').screenshot({ path: testInfo.outputPath('arde-axis-labels.png') })
})

test('material selection matches painted cells in narrow and short comparison canvases', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await page.goto('/')
  await expect(page.locator('.startup-screen')).toBeHidden()
  await page.getByTestId('view-compare').click()
  const panel = page.locator('.comparison-panel').first()
  const canvas = panel.locator('canvas')

  for (const viewport of [{ width: 900, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await canvas.scrollIntoViewIfNeeded()
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const bounds = element.getBoundingClientRect()
      return Math.abs(element.width / ratio - bounds.width) < 1 && Math.abs(element.height / ratio - bounds.height) < 1
    })).toBe(true)

    // Target the painted center of engine cell (3, 61), not an arbitrary hit area.
    // The default 112 × 84 grid has low-k at this cell, X 7 nm / height 45 nm.
    const target = await canvas.evaluate((element: HTMLCanvasElement) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = element.width / ratio
      const height = element.height / ratio
      const bounds = element.getBoundingClientRect()
      return {
        x: (50 + (3.5 / 112) * (width - 68)) / width * bounds.width,
        y: (20 + (61.5 / 84) * (height - 58)) / height * bounds.height,
      }
    })
    await canvas.click({ position: target })
    const inspector = panel.getByLabel('Selected material details')
    await expect(inspector).toBeVisible()
    await expect(inspector.getByText('X 7.0 nm · height 45.0 nm')).toBeVisible()
    await expect(inspector.getByText('42 nm at this X, measured from contiguous engine cells')).toBeVisible()
    await panel.screenshot({ path: testInfo.outputPath(`material-selection-${viewport.width}.png`) })
    await panel.getByRole('button', { name: 'Close material details' }).click()
  }
})
