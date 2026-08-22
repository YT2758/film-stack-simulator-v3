import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..')
const CONTENT_DIR = path.join(ROOT_DIR, 'content')
const CASE_STUDIES_DIR = path.join(CONTENT_DIR, 'case-studies')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const CASE_OUTPUT_DIR = path.join(PUBLIC_DIR, 'case-studies')
const TRUST_OUTPUT_DIR = path.join(PUBLIC_DIR, 'trust')
const ASSET_OUTPUT_DIR = path.join(PUBLIC_DIR, 'assets')
const PACKAGE_PATH = path.join(ROOT_DIR, 'package.json')
const FONT_SOURCE_PATH = path.join(
  ROOT_DIR,
  'node_modules',
  '@fontsource-variable',
  'ibm-plex-sans',
  'files',
  'ibm-plex-sans-latin-wght-normal.woff2',
)
const FONT_OUTPUT_NAME = 'content-ibm-plex-sans-latin-wght.woff2'

try {
  process.loadEnvFile(path.join(ROOT_DIR, '.env'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const EXPECTED_CASES = [
  { file: 'arde-deep-etch-slower.md', slug: 'arde-deep-etch-slower', preset: 'arde-demo' },
  { file: 'sadp-pitch-walking.md', slug: 'sadp-pitch-walking', preset: 'sadp-pitch-walking' },
  {
    file: 'borderless-via-overlay-margin.md',
    slug: 'borderless-via-overlay-margin',
    preset: 'borderless-via-margin',
  },
]

const DEPENDENCY_PURPOSES = {
  '@fontsource-variable/ibm-plex-sans': 'Self-hosted IBM Plex Sans font asset',
  pako: 'Local URL-state compression and decompression',
  react: 'Simulator user-interface rendering',
  'react-dom': 'React browser DOM integration',
  three: 'Client-side 3D presentation',
}

marked.setOptions({ gfm: true })

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeXml(value) {
  return escapeHtml(value)
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function parseFrontMatter(source, sourcePath) {
  const normalized = source.replaceAll('\r\n', '\n')
  if (!normalized.startsWith('---\n')) {
    throw new Error(`${sourcePath} must start with front matter`)
  }

  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) throw new Error(`${sourcePath} has unterminated front matter`)

  const metadata = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    if (colon <= 0) throw new Error(`${sourcePath} has an invalid front-matter line: ${line}`)
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    metadata[key] = value
  }

  return { metadata, body: normalized.slice(end + 5).trim() }
}

function requiredMetadata(metadata, keys, sourcePath) {
  for (const key of keys) {
    if (!metadata[key]) throw new Error(`${sourcePath} is missing front-matter field ${key}`)
  }
}

function rejectRawHtml(body, sourcePath) {
  if (/^\s*<[/!A-Za-z]/m.test(body)) {
    throw new Error(`${sourcePath} must not contain raw HTML`)
  }
}

function readSiteUrl() {
  const configured = process.env.PUBLIC_SITE_URL?.trim()
  const isCloudflareBuild = process.env.CF_PAGES === '1'
  if (isCloudflareBuild && (!configured || new URL(configured).hostname === 'example.com')) {
    throw new Error('Cloudflare Pages builds require PUBLIC_SITE_URL to be the real public origin')
  }
  if (!configured) {
    console.warn('PUBLIC_SITE_URL is unset; generated SEO URLs use https://example.com and are not release-ready')
  }
  const raw = configured || 'https://example.com'
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_SITE_URL must use http or https')
  }
  if (isCloudflareBuild && url.protocol !== 'https:') {
    throw new Error('Cloudflare Pages PUBLIC_SITE_URL must use https')
  }
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

function optionalHttpUrl(raw, variableName, siteUrl, allowRelative = false) {
  const value = raw?.trim()
  if (!value) return null
  if (!allowRelative && !/^https?:\/\//i.test(value)) {
    throw new Error(`${variableName} must be an absolute http(s) URL`)
  }
  const url = new URL(value, `${siteUrl}/`)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${variableName} must use http or https`)
  }
  return url
}

const siteUrl = readSiteUrl()
const newsletterAction = optionalHttpUrl(
  process.env.NEWSLETTER_FORM_ACTION,
  'NEWSLETTER_FORM_ACTION',
  siteUrl,
  true,
)
if (newsletterAction && newsletterAction.protocol !== 'https:') {
  throw new Error('NEWSLETTER_FORM_ACTION must use https')
}
const DEFAULT_REPOSITORY_URL = 'https://github.com/YT2758/film-stack-simulator-v3'
const repositoryUrl = optionalHttpUrl(
  process.env.GITHUB_REPOSITORY_URL || DEFAULT_REPOSITORY_URL,
  'GITHUB_REPOSITORY_URL',
  siteUrl,
)
const authorName = process.env.AUTHOR_NAME?.trim() || ''
const authorEmail = process.env.AUTHOR_EMAIL?.trim() || ''
if (authorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
  throw new Error('AUTHOR_EMAIL must be a valid email address')
}

function absoluteUrl(pathname) {
  return new URL(pathname, `${siteUrl}/`).toString()
}

function formActionPolicy() {
  if (!newsletterAction) return "'none'"
  const siteOrigin = new URL(siteUrl).origin
  return newsletterAction.origin === siteOrigin ? "'self'" : `'self' ${newsletterAction.origin}`
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "connect-src 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self'",
    "script-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formActionPolicy()}`,
    "frame-ancestors 'none'",
  ].join('; ')
}

function navigation() {
  const repositoryItem = repositoryUrl
    ? `<a href="${escapeHtml(repositoryUrl.toString())}" rel="noopener noreferrer">Source</a>`
    : ''
  return `<nav class="site-nav" aria-label="Primary">
    <a class="brand" href="/">Film Stack Simulator</a>
    <span class="nav-links">
      <a href="/case-studies/">Case studies</a>
      <a href="/trust/">Trust &amp; verification</a>
      ${repositoryItem}
    </span>
  </nav>`
}

function newsletterBlock() {
  if (!newsletterAction) {
    return `<aside class="newsletter" aria-labelledby="newsletter-title">
      <p class="eyebrow">Case-study updates</p>
      <h2 id="newsletter-title">Email updates are unavailable</h2>
      <p>No newsletter endpoint has been configured for this build. No email field or inactive form is shown.</p>
    </aside>`
  }

  return `<aside class="newsletter" aria-labelledby="newsletter-title">
    <p class="eyebrow">Case-study updates</p>
    <h2 id="newsletter-title">Get new educational cases by email</h2>
    <p>Submitting this form sends your address to the endpoint selected by the site owner. The simulator itself never uses it.</p>
    <form method="post" action="${escapeHtml(newsletterAction.toString())}">
      <label for="newsletter-email">Email address</label>
      <span class="form-row">
        <input id="newsletter-email" name="email" type="email" autocomplete="email" required>
        <button type="submit">Subscribe</button>
      </span>
    </form>
  </aside>`
}

function pageShell({ title, description, canonicalPath, type = 'website', body, jsonLd }) {
  const canonical = absoluteUrl(canonicalPath)
  const structuredData = jsonLd ? `\n    <script type="application/ld+json">${safeJson(jsonLd)}</script>` : ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(contentSecurityPolicy())}">
    <meta name="referrer" content="no-referrer">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <meta name="theme-color" content="#07110f">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="${escapeHtml(type)}">
    <meta property="og:site_name" content="Film Stack Simulator">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta name="twitter:card" content="summary">
    <link rel="stylesheet" href="/content.css">${structuredData}
  </head>
  <body>
    <header>${navigation()}</header>
    ${body}
    <footer class="site-footer">
      <p>Educational geometry simulator · browser-only processing · no ads or tracking</p>
      <p><a href="/trust/">Verify the zero-egress claim</a></p>
    </footer>
  </body>
</html>
`
}

function articleJsonLd(metadata) {
  const canonical = absoluteUrl(metadata.canonical)
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: metadata.title,
    description: metadata.description,
    datePublished: metadata.datePublished,
    dateModified: metadata.dateModified,
    mainEntityOfPage: canonical,
    url: canonical,
    isAccessibleForFree: true,
    about: metadata.keywords.split(',').map((keyword) => keyword.trim()),
  }
  if (authorName) data.author = { '@type': 'Person', name: authorName }
  return data
}

function renderArticle(article) {
  const { metadata, body } = article
  const authorLabel = authorName ? `By ${escapeHtml(authorName)}` : 'Educational case study'
  const authorContact = authorEmail
    ? ` · <a href="mailto:${escapeHtml(encodeURIComponent(authorEmail))}">Contact author</a>`
    : ''
  const byline = `<p class="byline">${authorLabel}${authorContact} · Updated <time datetime="${escapeHtml(metadata.dateModified)}">${escapeHtml(metadata.dateModified)}</time></p>`
  const htmlBody = `<main class="page-shell">
    <article class="technical-article">
      <header class="article-header">
        <p class="eyebrow">Case study</p>
        <h1>${escapeHtml(metadata.title)}</h1>
        <p class="dek">${escapeHtml(metadata.description)}</p>
        ${byline}
      </header>
      <div class="article-body">${marked.parse(body)}</div>
    </article>
    ${newsletterBlock()}
  </main>`
  return pageShell({
    title: metadata.title,
    description: metadata.description,
    canonicalPath: metadata.canonical,
    type: 'article',
    body: htmlBody,
    jsonLd: articleJsonLd(metadata),
  })
}

function renderCaseIndex(articles) {
  const title = 'Semiconductor process geometry case studies'
  const description =
    'Educational ARDE, SADP pitch-walking, and borderless-via geometry cases with one-click browser-only simulator presets.'
  const cards = articles
    .map(
      ({ metadata }) => `<article class="case-card">
        <p class="eyebrow">Interactive case</p>
        <h2><a href="${escapeHtml(metadata.canonical)}">${escapeHtml(metadata.title)}</a></h2>
        <p>${escapeHtml(metadata.description)}</p>
        <p class="card-actions"><a href="${escapeHtml(metadata.canonical)}">Read the case →</a> <a href="/?preset=${escapeHtml(metadata.preset)}">Open preset →</a></p>
      </article>`,
    )
    .join('\n')
  const body = `<main class="page-shell">
    <section class="index-hero">
      <p class="eyebrow">Learn by changing one input</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="dek">${escapeHtml(description)}</p>
      <p>Every case labels the simulator's limits, cites primary literature, and opens a generalized preset. No article claims proprietary dimensions or production results.</p>
    </section>
    <section class="case-grid" aria-label="Published case studies">${cards}</section>
    ${newsletterBlock()}
  </main>`
  const canonicalPath = '/case-studies/'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: absoluteUrl(canonicalPath),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map(({ metadata }, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: metadata.title,
        url: absoluteUrl(metadata.canonical),
      })),
    },
  }
  return pageShell({ title, description, canonicalPath, body, jsonLd })
}

function runtimeDependencyList(dependencies) {
  const entries = Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))
  return `<ul class="dependency-list">
${entries
  .map(
    ([name, version]) => `  <li data-runtime-dependency="${escapeHtml(name)}"><code>${escapeHtml(name)}</code> <span>${escapeHtml(version)}</span><small>${escapeHtml(DEPENDENCY_PURPOSES[name] || 'Declared browser runtime dependency')}</small></li>`,
  )
  .join('\n')}
</ul>`
}

function renderRepositoryLink() {
  if (!repositoryUrl) {
    return '<span class="config-note">Repository URL is not configured in this build.</span>'
  }
  return `<a href="${escapeHtml(repositoryUrl.toString())}" rel="noopener noreferrer">open the configured source repository</a>`
}

function renderTrust(trustSource, packageJson) {
  const { metadata, body } = trustSource
  const expandedBody = body
    .replace('{{RUNTIME_DEPENDENCIES}}', runtimeDependencyList(packageJson.dependencies || {}))
    .replace('{{REPOSITORY_LINK}}', renderRepositoryLink())
  const pageBody = `<main class="page-shell">
    <article class="technical-article trust-article">
      <header class="article-header">
        <p class="eyebrow">Trust is verifiable</p>
        <h1>${escapeHtml(metadata.title)}</h1>
        <p class="dek">${escapeHtml(metadata.description)}</p>
      </header>
      <div class="article-body">${marked.parse(expandedBody)}</div>
    </article>
  </main>`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: metadata.title,
    description: metadata.description,
    dateModified: metadata.dateModified,
    url: absoluteUrl(metadata.canonical),
  }
  return pageShell({
    title: metadata.title,
    description: metadata.description,
    canonicalPath: metadata.canonical,
    body: pageBody,
    jsonLd,
  })
}

function stylesheet() {
  return `@font-face {
  font-family: "IBM Plex Sans Local";
  src: url("/assets/${FONT_OUTPUT_NAME}") format("woff2");
  font-style: normal;
  font-weight: 100 700;
  font-display: swap;
}

:root {
  color-scheme: dark;
  --ink: #e7f2ed;
  --muted: #9cb2a9;
  --panel: #0d1d19;
  --panel-2: #122a24;
  --line: #29443b;
  --accent: #77e0b5;
  --accent-2: #f0c76b;
  --bg: #07110f;
  font-family: "IBM Plex Sans Local", ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }
html { background: var(--bg); color: var(--ink); line-height: 1.65; }
body { margin: 0; min-width: 18rem; }
a { color: var(--accent); text-underline-offset: 0.18em; }
a:hover { color: #b3f5d8; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

header { border-bottom: 1px solid var(--line); background: rgba(7, 17, 15, 0.96); }
.site-nav, .site-footer, .page-shell { width: min(72rem, calc(100% - 2rem)); margin-inline: auto; }
.site-nav { min-height: 4rem; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; }
.brand { color: var(--ink); font-weight: 650; text-decoration: none; letter-spacing: -0.02em; }
.nav-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 1rem; font-size: 0.92rem; }
.page-shell { padding-block: clamp(2.5rem, 7vw, 6rem); }
.technical-article, .index-hero { max-width: 48rem; margin-inline: auto; }
.article-header { padding-bottom: 2rem; border-bottom: 1px solid var(--line); }
.eyebrow { color: var(--accent-2); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
h1, h2, h3 { line-height: 1.15; letter-spacing: -0.025em; text-wrap: balance; }
h1 { margin: 0.35rem 0 1rem; font-size: clamp(2.25rem, 7vw, 4.4rem); }
h2 { margin-top: 3rem; font-size: clamp(1.45rem, 4vw, 2rem); }
h3 { margin-top: 2rem; }
.dek { max-width: 43rem; color: #bfd2ca; font-size: clamp(1.08rem, 2vw, 1.3rem); }
.byline { color: var(--muted); font-size: 0.9rem; }
.article-body > p, .article-body > ul, .article-body > ol { max-width: 44rem; }
.article-body blockquote { margin: 2rem 0; padding: 1rem 1.25rem; border-left: 0.22rem solid var(--accent-2); background: var(--panel); color: #d9e8e1; }
.article-body blockquote p { margin: 0; }
table { width: 100%; margin: 1.5rem 0; border-collapse: collapse; font-size: 0.93rem; }
th, td { padding: 0.7rem; border: 1px solid var(--line); text-align: left; vertical-align: top; }
th { background: var(--panel-2); }
.article-body li + li { margin-top: 0.65rem; }

.newsletter { max-width: 48rem; margin: 4rem auto 0; padding: clamp(1.25rem, 4vw, 2rem); border: 1px solid var(--line); border-radius: 0.8rem; background: var(--panel); }
.newsletter h2 { margin: 0.25rem 0 0.75rem; }
.newsletter label { display: block; margin-bottom: 0.4rem; font-weight: 600; }
.form-row { display: flex; gap: 0.65rem; }
input, button { min-height: 2.8rem; border-radius: 0.35rem; font: inherit; }
input { flex: 1; min-width: 8rem; padding: 0.6rem 0.8rem; border: 1px solid #557266; background: #07110f; color: var(--ink); }
button { padding: 0.6rem 1rem; border: 0; background: var(--accent); color: #062018; font-weight: 700; cursor: pointer; }

.case-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 3rem; }
.case-card { padding: 1.4rem; border: 1px solid var(--line); border-radius: 0.7rem; background: var(--panel); }
.case-card h2 { margin: 0.3rem 0 0.8rem; font-size: 1.4rem; }
.card-actions { display: flex; flex-wrap: wrap; gap: 0.8rem; }
.dependency-list { padding: 0; list-style: none; }
.dependency-list li { display: grid; grid-template-columns: minmax(14rem, 1fr) auto; gap: 0.1rem 1rem; padding: 0.75rem 0; border-bottom: 1px solid var(--line); }
.dependency-list small { grid-column: 1 / -1; color: var(--muted); }
.config-note { color: var(--accent-2); }
.site-footer { display: flex; justify-content: space-between; gap: 1rem; padding-block: 2rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.86rem; }

@media (max-width: 48rem) {
  .site-nav, .site-footer, .form-row { align-items: stretch; flex-direction: column; }
  .site-nav { padding-block: 1rem; }
  .nav-links { justify-content: flex-start; }
  .case-grid { grid-template-columns: 1fr; }
  .dependency-list li { grid-template-columns: 1fr; }
  .dependency-list small { grid-column: auto; }
  table { display: block; overflow-x: auto; }
}
`
}

async function loadArticle(definition) {
  const sourcePath = path.join(CASE_STUDIES_DIR, definition.file)
  const parsed = parseFrontMatter(await readFile(sourcePath, 'utf8'), sourcePath)
  requiredMetadata(
    parsed.metadata,
    [
      'slug',
      'title',
      'description',
      'canonical',
      'preset',
      'datePublished',
      'dateModified',
      'keywords',
    ],
    sourcePath,
  )
  if (parsed.metadata.slug !== definition.slug || parsed.metadata.preset !== definition.preset) {
    throw new Error(`${sourcePath} slug or preset does not match the content manifest`)
  }
  const expectedCanonical = `/case-studies/${definition.slug}/`
  if (parsed.metadata.canonical !== expectedCanonical) {
    throw new Error(`${sourcePath} canonical must be ${expectedCanonical}`)
  }
  rejectRawHtml(parsed.body, sourcePath)
  return { ...parsed, sourcePath }
}

async function writePage(directory, html) {
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'index.html'), html, 'utf8')
}

async function build() {
  const packageJson = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'))
  const articles = await Promise.all(EXPECTED_CASES.map(loadArticle))
  const trustPath = path.join(CONTENT_DIR, 'trust.md')
  const trust = parseFrontMatter(await readFile(trustPath, 'utf8'), trustPath)
  requiredMetadata(trust.metadata, ['title', 'description', 'canonical', 'dateModified'], trustPath)
  rejectRawHtml(trust.body, trustPath)

  await rm(CASE_OUTPUT_DIR, { recursive: true, force: true })
  await rm(TRUST_OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(ASSET_OUTPUT_DIR, { recursive: true })

  await Promise.all([
    ...articles.map((article) =>
      writePage(path.join(CASE_OUTPUT_DIR, article.metadata.slug), renderArticle(article)),
    ),
    writePage(CASE_OUTPUT_DIR, renderCaseIndex(articles)),
    writePage(TRUST_OUTPUT_DIR, renderTrust(trust, packageJson)),
    writeFile(path.join(PUBLIC_DIR, 'content.css'), stylesheet(), 'utf8'),
    cp(FONT_SOURCE_PATH, path.join(ASSET_OUTPUT_DIR, FONT_OUTPUT_NAME)),
  ])

  const sitemapEntries = [
    { path: '/', lastmod: trust.metadata.dateModified },
    { path: '/case-studies/', lastmod: maxDate(articles.map(({ metadata }) => metadata.dateModified)) },
    { path: '/trust/', lastmod: trust.metadata.dateModified },
    ...articles.map(({ metadata }) => ({ path: metadata.canonical, lastmod: metadata.dateModified })),
  ]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(absoluteUrl(entry.path))}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
  </url>`,
  )
  .join('\n')}
</urlset>
`
  await writeFile(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap, 'utf8')

  console.log(
    `Built ${articles.length} case studies, case index, trust page, and sitemap for ${siteUrl}${newsletterAction ? ' with newsletter form' : ' without newsletter form'}.`,
  )
}

function maxDate(values) {
  return [...values].sort().at(-1)
}

await build()
