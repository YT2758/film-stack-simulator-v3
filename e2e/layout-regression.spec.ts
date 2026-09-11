import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

async function openLayout(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('simulator')).toBeVisible()
  await expect(page.locator('.startup-screen')).toBeHidden()
  await page.locator('.side-tabs').getByRole('button', { name: /layout/i }).click()
  await page.locator('.layout-canvas').scrollIntoViewIfNeeded()
}

async function screenPoint(page: Page, x: number, y: number) {
  return page.locator('.layout-canvas').evaluate((element, point) => {
    const svg = element as SVGSVGElement
    const local = svg.createSVGPoint()
    local.x = point.x
    local.y = point.y
    const matrix = svg.getScreenCTM()
    if (!matrix) throw new Error('The displayed SVG has no coordinate transform')
    const screen = local.matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  }, { x, y })
}

async function exportedLayout(page: Page) {
  const pendingDownload = page.waitForEvent('download')
  await page.getByTestId('export-json').click()
  const downloaded = await pendingDownload
  const path = await downloaded.path()
  expect(path).not.toBeNull()
  return JSON.parse(await readFile(path!, 'utf8')).layout
}

test('layout vertex dragging follows the rendered SVG, including padding and boundary clamping', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openLayout(page)
  const vertex = page.locator('.layout-canvas circle').first()
  const bounds = await page.locator('.layout-canvas').boundingBox()
  expect(bounds!.width / bounds!.height).toBeGreaterThan(1.2)
  const start = await screenPoint(page, 34, 14)
  const destination = await screenPoint(page, 10, 25)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(destination.x, destination.y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => Number(await vertex.getAttribute('cx'))).toBeCloseTo(10, 3)
  await expect.poll(async () => Number(await vertex.getAttribute('cy'))).toBeCloseTo(25, 3)
  let layout = await exportedLayout(page)
  expect(layout.features[0].points[0].x).toBeCloseTo(0.1, 5)
  expect(layout.features[0].points[0].y).toBeCloseTo(0.25, 5)

  // Continue beyond the SVG viewport while captured, then return to its edge.
  const outside = await screenPoint(page, -20, 30)
  await page.mouse.move(destination.x, destination.y)
  await page.mouse.down()
  await page.mouse.move(outside.x, outside.y, { steps: 5 })
  await expect.poll(async () => Number(await vertex.getAttribute('cx'))).toBe(0)
  await expect.poll(async () => Number(await vertex.getAttribute('cy'))).toBeCloseTo(30, 3)
  await page.mouse.up()
  layout = await exportedLayout(page)
  expect(layout.features[0].points[0]).toEqual({ x: 0, y: 0.3 })

  // Pointer release must stop editing even if it happened outside the SVG.
  const elsewhere = await screenPoint(page, 40, 40)
  await page.mouse.move(elsewhere.x, elsewhere.y)
  await expect(vertex).toHaveAttribute('cx', '0')
  await page.locator('.layout-panel').screenshot({ path: testInfo.outputPath('layout-desktop.png') })
})

test.describe('phone touch layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('trusted touch drags map to the same vertex and cut coordinates', async ({ page }, testInfo) => {
    await openLayout(page)
    const client = await page.context().newCDPSession(page)
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] })
      for (let index = 1; index <= 5; index += 1) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: from.x + (to.x - from.x) * index / 5, y: from.y + (to.y - from.y) * index / 5, id: 1 }],
        })
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    try {
      const vertex = page.locator('.layout-canvas circle').first()
      await drag(await screenPoint(page, 34, 14), await screenPoint(page, 10, 25))
      await expect.poll(async () => Number(await vertex.getAttribute('cx'))).toBeCloseTo(10, 2)
      await expect.poll(async () => Number(await vertex.getAttribute('cy'))).toBeCloseTo(25, 2)
      await drag(await screenPoint(page, 80, 50), await screenPoint(page, 80, 75))
      await expect(page.getByLabel('Cross-section cut position')).toHaveValue('0.75')
      await expect.poll(async () => Number(await page.locator('.cut-line-group line').getAttribute('y1'))).toBeCloseTo(75, 2)
      const layout = await exportedLayout(page)
      expect(layout.features[0].points[0].x).toBeCloseTo(0.1, 4)
      expect(layout.features[0].points[0].y).toBeCloseTo(0.25, 4)
      expect(layout.cutPosition).toBeCloseTo(0.75, 4)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
      await page.locator('.layout-panel').screenshot({ path: testInfo.outputPath('layout-phone-touch.png') })
    } finally {
      await client.detach()
    }
  })
})
