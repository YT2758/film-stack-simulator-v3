import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = join(root, 'dist')
const violations = []

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}

function report(file, reason, match) {
  violations.push(`${relative(root, file)}: ${reason}${match ? ` (${match.slice(0, 100)})` : ''}`)
}

const indexPath = join(dist, 'index.html')
const indexHtml = await readFile(indexPath, 'utf8')
if (!/connect-src\s+'none'/u.test(indexHtml)) report(indexPath, "simulator CSP does not set connect-src 'none'")

const resourceAttribute = /<(?:script|img|iframe|source|video|audio|link)\b[^>]*?\b(?:src|href|poster)=["']([^"']+)["']/giu
for (const match of indexHtml.matchAll(resourceAttribute)) {
  const url = match[1]
  if (/^(?:https?:)?\/\//iu.test(url)) report(indexPath, 'automatic resource points outside the site', url)
}

const distFiles = await walk(dist)
for (const file of distFiles) {
  const extension = extname(file)
  if (!['.css', '.js', '.mjs', '.html'].includes(extension)) continue
  const contents = await readFile(file, 'utf8')
  if (extension === '.css') {
    for (const match of contents.matchAll(/(?:@import\s+|url\()\s*["']?((?:https?:)?\/\/[^\s"')]+)/giu)) {
      report(file, 'stylesheet loads an external resource', match[1])
    }
  }
  if (extension === '.js' || extension === '.mjs') {
    for (const match of contents.matchAll(/(?:fetch|WebSocket|EventSource|sendBeacon|importScripts)\s*\(\s*["'](https?:\/\/[^"']+)/gu)) {
      report(file, 'bundle contains a literal external network call', match[1])
    }
    for (const match of contents.matchAll(/import\s*\(\s*["'](https?:\/\/[^"']+)/gu)) {
      report(file, 'bundle contains a remote dynamic import', match[1])
    }
  }
}

const sourceFiles = (await walk(join(root, 'src'))).filter((file) => ['.ts', '.tsx'].includes(extname(file)))
for (const file of sourceFiles) {
  const contents = await readFile(file, 'utf8')
  for (const match of contents.matchAll(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/gu)) {
    report(file, 'simulator source uses a network API', match[0])
  }
}

if (violations.length) {
  process.stderr.write(`Zero-egress artifact audit failed:\n- ${violations.join('\n- ')}\n`)
  process.exit(1)
}

process.stdout.write(`Zero-egress artifact audit passed (${distFiles.length} built files inspected).\n`)
