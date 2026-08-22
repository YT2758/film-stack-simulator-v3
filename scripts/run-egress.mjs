import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

async function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (!address || typeof address === 'string') {
        probe.close()
        reject(new Error('Could not reserve a local preview port.'))
        return
      }
      probe.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function readDistArtifactPaths() {
  const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
  const paths = new Set()
  async function walk(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(join(directory, entry.name), relativePath)
      } else if (entry.isFile()) {
        paths.add(`/${relativePath}`)
      }
    }))
  }
  try {
    await walk(distDirectory)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('dist/ is missing. Run npm run build before the zero-egress runtime check.')
    }
    throw error
  }
  return paths
}

function normalizeConfiguredOrigin(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('EGRESS_TEST_ORIGIN must be an absolute HTTP(S) origin, for example https://film-stack.example.com.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error('EGRESS_TEST_ORIGIN must contain only an HTTP(S) origin (no credentials, path, query, or fragment).')
  }
  return url.origin
}

const configuredOrigin = process.env.EGRESS_TEST_ORIGIN?.trim()
const port = configuredOrigin ? undefined : await reserveAvailablePort()
const origin = configuredOrigin
  ? normalizeConfiguredOrigin(configuredOrigin)
  : `http://127.0.0.1:${port}`
const distArtifactPaths = await readDistArtifactPaths()
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean)

let serverLog = ''
let server
if (!configuredOrigin) {
  const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
  server = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('../', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString() })
}

async function stopPreviewServer() {
  if (!server) return
  if (server.exitCode !== null || server.signalCode !== null) return
  const exited = new Promise((resolve) => server.once('exit', () => resolve(true)))
  server.kill('SIGTERM')
  const stopped = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve(false), 1_000)),
  ])
  if (!stopped && server.exitCode === null && server.signalCode === null) server.kill('SIGKILL')
}

async function waitForServer() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin)
      if (response.ok && (await response.text()).includes('private process geometry in your browser')) return
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  if (server) throw new Error(`Preview server did not start.\n${serverLog}`)
  throw new Error(`EGRESS_TEST_ORIGIN did not become ready: ${origin}`)
}

let browser
try {
  await waitForServer()
  const executablePath = chromeCandidates.find((candidate) => existsSync(candidate))
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const context = await browser.newContext({ acceptDownloads: true })
  const requestViolations = []
  const approvedNavigations = []
  const approvedNavigationRequests = new WeakSet()
  const apiAttemptsById = new Map()
  const staticResourceTypes = new Set([
    'font',
    'image',
    'manifest',
    'media',
    'other',
    'script',
    'stylesheet',
    'texttrack',
    'worker',
  ])
  const artifactPathFor = (url) => url.pathname.endsWith('/')
    ? `${url.pathname}index.html`
    : url.pathname

  const recordApiAttempt = (attempt) => {
    const id = typeof attempt?.id === 'string'
      ? attempt.id
      : `unidentified:${apiAttemptsById.size}`
    apiAttemptsById.set(id, attempt)
  }

  await context.exposeBinding('__filmStackRecordNetworkAttempt', (_source, attempt) => {
    recordApiAttempt(attempt)
  })
  await context.addInitScript(() => {
    const attempts = []
    Object.defineProperty(window, '__filmStackNetworkAttempts', { value: attempts })
    const documentId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${performance.timeOrigin}:${Math.random()}`
    let sequence = 0
    const describe = (value) => {
      try {
        if (typeof value === 'string') return value
        if (value && typeof value.url === 'string') return value.url
        return String(value)
      } catch { return '<unreadable>' }
    }
    const record = (api, target, method) => {
      const attempt = {
        id: `${documentId}:${sequence += 1}`,
        api,
        method,
        target: describe(target),
        documentUrl: location.href,
      }
      attempts.push(attempt)
      try {
        const report = window.__filmStackRecordNetworkAttempt(attempt)
        if (report && typeof report.catch === 'function') report.catch(() => {})
      } catch {
        // The in-document copy is harvested before each test-driven navigation.
      }
    }
    const originalFetch = window.fetch
    window.fetch = function (...args) {
      const method = args[1]?.method ?? args[0]?.method ?? 'GET'
      record('fetch', args[0], describe(method).toUpperCase())
      return originalFetch.apply(this, args)
    }
    const OriginalWebSocket = window.WebSocket
    window.WebSocket = new Proxy(OriginalWebSocket, {
      construct(Target, args, NewTarget) {
        record('WebSocket', args[0], 'CONNECT')
        return Reflect.construct(Target, args, NewTarget)
      },
    })
    const OriginalEventSource = window.EventSource
    window.EventSource = new Proxy(OriginalEventSource, {
      construct(Target, args, NewTarget) {
        record('EventSource', args[0], 'GET')
        return Reflect.construct(Target, args, NewTarget)
      },
    })
    const beacon = navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = (url, data) => {
      record('sendBeacon', url, 'POST')
      return beacon(url, data)
    }
    const open = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      record('XMLHttpRequest', url, describe(method).toUpperCase())
      return open.call(this, method, url, ...rest)
    }
  })

  context.on('request', (request) => {
    const requestUrl = request.url()
    const method = request.method().toUpperCase()
    const resourceType = request.resourceType()
    const reasons = []
    let url
    try {
      url = new URL(requestUrl)
      if (url.origin !== origin) reasons.push('cross-origin')
    } catch {
      reasons.push('invalid URL')
    }

    if (request.isNavigationRequest()) {
      let requestPage
      try { requestPage = request.frame().page() } catch { /* A detached frame is never approved. */ }
      const redirectedFrom = request.redirectedFrom()
      const approvalIndex = approvedNavigations.findIndex((approval) => (
        approval.page === requestPage && approval.url === requestUrl
      ))
      const followsApprovedRedirect = Boolean(
        redirectedFrom && approvedNavigationRequests.has(redirectedFrom),
      )
      if (method !== 'GET') reasons.push('non-GET document navigation')
      if (url && !distArtifactPaths.has(artifactPathFor(url))) {
        reasons.push('document path is absent from dist artifact')
      }
      if (approvalIndex === -1 && !followsApprovedRedirect) {
        reasons.push('document navigation was not initiated by this smoke test')
      } else if (!reasons.length) {
        approvedNavigationRequests.add(request)
      }
      if (approvalIndex !== -1) approvedNavigations.splice(approvalIndex, 1)
    } else {
      if (!['GET', 'HEAD'].includes(method)) reasons.push('non-read request method')
      if (!staticResourceTypes.has(resourceType)) reasons.push(`non-static resource type: ${resourceType}`)
      if (url?.search) reasons.push('static asset request has a query')
      if (url && !distArtifactPaths.has(artifactPathFor(url))) {
        reasons.push('request path is absent from dist artifact')
      }
    }

    if (reasons.length) {
      requestViolations.push({ method, resourceType, url: requestUrl, reasons })
    }
  })

  const page = await context.newPage()

  async function harvestApiAttempts() {
    try {
      const attempts = await page.evaluate(() => window.__filmStackNetworkAttempts ?? [])
      for (const attempt of attempts) recordApiAttempt(attempt)
    } catch {
      // The context binding still records attempts if a document is navigating away.
    }
  }

  async function navigate(target) {
    await harvestApiAttempts()
    const url = new URL(target, origin)
    if (url.origin !== origin) throw new Error(`Smoke navigation must stay on ${origin}: ${url.href}`)
    const approval = { page, url: url.href }
    approvedNavigations.push(approval)
    try {
      return await page.goto(url.href, { waitUntil: 'networkidle' })
    } finally {
      const approvalIndex = approvedNavigations.indexOf(approval)
      if (approvalIndex !== -1) approvedNavigations.splice(approvalIndex, 1)
    }
  }

  await navigate(origin)
  await page.getByTestId('simulator').waitFor()
  await page.locator('.startup-screen').waitFor({ state: 'detached' })
  await page.getByLabel('Flow name').fill('Protected local draft')
  await page.waitForTimeout(1_200)
  await navigate(`${origin}/?preset=missing-preset`)
  await page.getByText(/Unknown preset/).waitFor()
  await page.getByRole('heading', { name: 'Untitled process study', level: 1 }).waitFor()
  await page.waitForTimeout(1_200)
  await navigate(`${origin}/?preset=arde-demo`)
  await page.waitForTimeout(1_200)
  await navigate(origin)
  await page.getByRole('button', { name: 'Resume session' }).click()
  await page.getByRole('heading', { name: 'Protected local draft', level: 1 }).waitFor()

  for (const preset of ['arde-demo', 'sadp-pitch-walking', 'borderless-via-margin']) {
    await navigate(`${origin}/?preset=${preset}`)
    await page.getByTestId('simulator').waitFor()
    await page.getByTestId('playback-range').fill('0')
    await page.getByTestId('playback-range').press('End')
  }

  const download = page.waitForEvent('download')
  await page.getByTestId('export-json').click()
  const downloadedFlow = await download
  const downloadedPath = await downloadedFlow.path()
  if (!downloadedPath) throw new Error('The browser did not provide the exported JSON path.')
  await page.locator('input[type="file"]').setInputFiles({
    name: downloadedFlow.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await readFile(downloadedPath),
  })
  await page.getByText('Imported locally. No file contents were uploaded.').waitFor()
  await page.getByTestId('view-3d').click()
  await page.getByLabel('3D view').waitFor({ timeout: 20_000 })
  await page.getByText(/Ready in \d+ ms/).waitFor({ timeout: 20_000 })
  await page.getByLabel('3D cut plane').fill('0.4')
  await page.getByText('Generating geometry in a local Web Worker…').waitFor({ timeout: 20_000 })
  await page.getByText(/Ready in \d+ ms/).waitFor({ timeout: 20_000 })
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PNG locally' }).click()
  const downloadedPng = await pngDownload
  if (!downloadedPng.suggestedFilename().endsWith('.png')) {
    throw new Error('The 3D export did not produce a PNG download.')
  }
  await page.waitForTimeout(1_200) // Let the documented one-second IndexedDB autosave settle.
  await navigate(origin)
  await page.getByRole('button', { name: 'Resume session' }).waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Resume session' }).click()

  await page.getByRole('button', { name: /Stacks/ }).click()
  await page.getByLabel('Name this stack').fill('Runtime smoke stack')
  await page.getByRole('button', { name: 'Save a copy' }).click()
  const savedStack = page.locator('.saved-stack-list article').filter({ hasText: 'Runtime smoke stack' })
  await savedStack.waitFor()
  page.once('dialog', async (dialog) => dialog.accept('Runtime renamed stack'))
  await savedStack.getByRole('button', { name: 'Rename' }).click()
  const renamedStack = page.locator('.saved-stack-list article').filter({ hasText: 'Runtime renamed stack' })
  await renamedStack.waitFor()
  await renamedStack.getByRole('button', { name: 'Open' }).click()
  await page.getByRole('heading', { name: 'Runtime renamed stack', level: 1 }).waitFor()
  await page.getByRole('button', { name: /Stacks/ }).click()
  page.once('dialog', async (dialog) => dialog.accept())
  await page.locator('.saved-stack-list article').filter({ hasText: 'Runtime renamed stack' }).getByRole('button', { name: 'Delete' }).click()
  await page.locator('.saved-stack-list article').filter({ hasText: 'Runtime renamed stack' }).waitFor({ state: 'detached' })

  await harvestApiAttempts()
  const apiAttempts = [...apiAttemptsById.values()]

  if (requestViolations.length || apiAttempts.length) {
    throw new Error(`Zero-egress runtime check failed.\nRequest violations: ${JSON.stringify(requestViolations)}\nBrowser API attempts: ${JSON.stringify(apiAttempts)}`)
  }
  console.log(`Zero-egress runtime check passed against ${origin}: preset fallback works and presets preserve prior drafts; replay, JSON/PNG export, import, autosave/resume, named-stack save/rename/delete, and 3D made only approved document and static-asset requests.`)
} finally {
  await browser?.close()
  await stopPreviewServer()
}
