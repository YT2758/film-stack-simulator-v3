import { spawnSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..')
const BUILD_SCRIPT = path.join(SCRIPT_DIR, 'build-content.mjs')
const CASE_SOURCE_DIR = path.join(ROOT_DIR, 'content', 'case-studies')
const PARAM_SOURCE_DIR = path.join(ROOT_DIR, 'src', 'docs', 'params')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')

const CASES = [
  {
    file: 'arde-deep-etch-slower.md',
    slug: 'arde-deep-etch-slower',
    preset: 'arde-demo',
    dois: ['10.1063/1.101937', '10.1116/1.580135'],
  },
  {
    file: 'sadp-pitch-walking.md',
    slug: 'sadp-pitch-walking',
    preset: 'sadp-pitch-walking',
    dois: ['10.1117/12.772953', '10.1117/12.782311', '10.1117/12.2297345'],
  },
  {
    file: 'borderless-via-overlay-margin.md',
    slug: 'borderless-via-overlay-margin',
    preset: 'borderless-via-margin',
    dois: [
      '10.1109/ICVC.1999.820962',
      '10.1007/s11664-001-0044-9',
      '10.4028/www.scientific.net/SSP.145-146.357',
    ],
  },
]

const ARTICLE_HEADINGS = [
  '1. Phenomenon and consequence',
  '2. Mechanism in the simulator',
  '3. Open this case in the simulator',
  '4. Further reading',
]

const PARAM_IDS = [
  'base.thickness',
  'layout.cutPosition',
  'deposition.mode',
  'deposition.material',
  'deposition.thicknessNm',
  'deposition.sidewallFactor',
  'etch.target',
  'etch.depthNm',
  'etch.selectivity',
  'etch.ardeFactor',
  'etch.mask',
  'etch.overlayNm',
  'sadp.mandrelPitchNm',
  'sadp.mandrelWidthNm',
  'sadp.spacerThicknessNm',
  'sadp.spacerHeightNm',
  'sadp.pitchWalkNm',
  'planarize.targetHeightNm',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function parseFrontMatter(source, sourcePath) {
  const normalized = source.replaceAll('\r\n', '\n')
  assert(normalized.startsWith('---\n'), `${sourcePath}: missing front matter`)
  const end = normalized.indexOf('\n---\n', 4)
  assert(end >= 0, `${sourcePath}: unterminated front matter`)
  const metadata = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    assert(colon > 0, `${sourcePath}: invalid front-matter line ${line}`)
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

function extractSection(body, heading, nextHeading) {
  const marker = `## ${heading}`
  const start = body.indexOf(marker)
  assert(start >= 0, `Missing section ${heading}`)
  const contentStart = start + marker.length
  const end = nextHeading ? body.indexOf(`## ${nextHeading}`, contentStart) : body.length
  assert(end >= 0, `Missing section boundary after ${heading}`)
  return body.slice(contentStart, end).trim()
}

function htmlDecode(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function extractMeta(html, name, attribute = 'name') {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const first = new RegExp(`<meta\\s+[^>]*${attribute}="${escaped}"[^>]*content="([^"]*)"[^>]*>`, 'i')
  const second = new RegExp(`<meta\\s+[^>]*content="([^"]*)"[^>]*${attribute}="${escaped}"[^>]*>`, 'i')
  const match = html.match(first) || html.match(second)
  return match ? htmlDecode(match[1]) : null
}

function extractCanonical(html) {
  const match = html.match(/<link\s+[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/i)
  return match ? htmlDecode(match[1]) : null
}

function extractJsonLd(html, sourcePath) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  assert(scripts.length === 1, `${sourcePath}: expected exactly one JSON-LD script`)
  assert(/type="application\/ld\+json"/i.test(scripts[0][1]), `${sourcePath}: executable script found`)
  assert(!/\bsrc\s*=/i.test(scripts[0][1]), `${sourcePath}: JSON-LD must be inline data`)
  return JSON.parse(scripts[0][2])
}

function assertNoRemoteAutomaticResources(html, sourcePath) {
  assert(!/<script\b[^>]*\bsrc\s*=/i.test(html), `${sourcePath}: script src is not allowed`)
  for (const match of html.matchAll(
    /<(?:img|iframe|source|audio|video|embed|object)\b[^>]*\b(?:src|data)="([^"]+)"/gi,
  )) {
    assert(!/^(?:https?:)?\/\//i.test(match[1]), `${sourcePath}: remote automatic resource ${match[1]}`)
  }
  for (const link of html.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = link[1].match(/\brel="([^"]+)"/i)?.[1] || ''
    const href = link[1].match(/\bhref="([^"]+)"/i)?.[1] || ''
    if (!/^(stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|manifest)$/i.test(rel)) {
      continue
    }
    assert(href.startsWith('/') && !href.startsWith('//'), `${sourcePath}: link resource must be same-origin: ${href}`)
  }
  assert(!/\bsrcset\s*=\s*["'][^"']*(?:https?:)?\/\//i.test(html), `${sourcePath}: remote srcset is not allowed`)
  assert(!/\bposter\s*=\s*["'](?:https?:)?\/\//i.test(html), `${sourcePath}: remote poster is not allowed`)
  assert(!/<(?:image|use)\b[^>]*(?:href|xlink:href)=["'](?:https?:)?\/\//i.test(html), `${sourcePath}: remote SVG resource is not allowed`)
  assert(!/\bstyle\s*=\s*["'][^"']*url\(\s*["']?(?:https?:)?\/\//i.test(html), `${sourcePath}: remote inline-style resource is not allowed`)
}

function runBuild({ siteUrl, newsletterAction, restore = false }) {
  const env = { ...process.env }
  if (!restore) {
    env.PUBLIC_SITE_URL = siteUrl
    if (newsletterAction) env.NEWSLETTER_FORM_ACTION = newsletterAction
    else env.NEWSLETTER_FORM_ACTION = ''
  }
  const result = spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: ROOT_DIR,
    env,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`content build failed:\n${result.stdout}${result.stderr}`)
  }
}

function verifyInsecureNewsletterRejected(siteUrl) {
  const result = spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PUBLIC_SITE_URL: siteUrl,
      NEWSLETTER_FORM_ACTION: 'http://newsletter-endpoint.test/subscribe',
    },
    encoding: 'utf8',
  })
  const output = `${result.stdout}${result.stderr}`
  assert(result.status !== 0, 'HTTP newsletter action must fail the content build')
  assert(output.includes('NEWSLETTER_FORM_ACTION must use https'), 'HTTP newsletter rejection must explain the HTTPS requirement')
}

function verifyCloudflareSiteUrlRequired() {
  const result = spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      CF_PAGES: '1',
      PUBLIC_SITE_URL: '',
      NEWSLETTER_FORM_ACTION: '',
    },
    encoding: 'utf8',
  })
  const output = `${result.stdout}${result.stderr}`
  assert(result.status !== 0, 'Cloudflare build without PUBLIC_SITE_URL must fail')
  assert(output.includes('require PUBLIC_SITE_URL'), 'Cloudflare URL rejection must explain the required setting')
}

async function verifyArticleSources() {
  const actualFiles = (await readdir(CASE_SOURCE_DIR)).filter((file) => file.endsWith('.md')).sort()
  assert(actualFiles.length === 3, `Expected exactly 3 case-study Markdown files; found ${actualFiles.length}`)

  const articles = []
  for (const definition of CASES) {
    assert(actualFiles.includes(definition.file), `Missing case-study source ${definition.file}`)
    const sourcePath = path.join(CASE_SOURCE_DIR, definition.file)
    const source = parseFrontMatter(await readFile(sourcePath, 'utf8'), sourcePath)
    const { metadata, body } = source
    assert(!/^\s*<[/!A-Za-z]/m.test(body), `${sourcePath}: raw HTML is not allowed in case-study Markdown`)
    for (const key of [
      'slug',
      'title',
      'description',
      'canonical',
      'preset',
      'datePublished',
      'dateModified',
      'keywords',
    ]) {
      assert(metadata[key], `${sourcePath}: missing ${key}`)
    }
    assert(metadata.slug === definition.slug, `${sourcePath}: wrong slug`)
    assert(metadata.preset === definition.preset, `${sourcePath}: wrong preset`)
    assert(
      metadata.canonical === `/case-studies/${definition.slug}/`,
      `${sourcePath}: canonical path does not match slug`,
    )
    assert(metadata.title.length >= 35 && metadata.title.length <= 65, `${sourcePath}: title length is not SEO-safe`)
    assert(
      metadata.description.length >= 120 && metadata.description.length <= 160,
      `${sourcePath}: description must be 120–160 characters`,
    )
    assert(/^\d{4}-\d{2}-\d{2}$/.test(metadata.datePublished), `${sourcePath}: invalid publish date`)
    assert(/^\d{4}-\d{2}-\d{2}$/.test(metadata.dateModified), `${sourcePath}: invalid modified date`)

    const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim())
    assert(
      JSON.stringify(headings) === JSON.stringify(ARTICLE_HEADINGS),
      `${sourcePath}: article must contain only the four fixed sections in order`,
    )
    assert(
      body.includes(`](/?preset=${definition.preset})`),
      `${sourcePath}: missing exact simulator preset link`,
    )
    assert(/Educational scope\./.test(body), `${sourcePath}: missing educational disclaimer`)
    assert(/No claim of first-hand production results is made\./.test(body), `${sourcePath}: disclaimer is not explicit`)
    assert(
      !/\b(?:I|we|my|our)\s+(?:saw|observed|experienced|ran|qualified|fixed)\b/i.test(body),
      `${sourcePath}: unverifiable first-person production claim`,
    )

    const furtherReading = extractSection(body, ARTICLE_HEADINGS[3])
    const citedDois = [...furtherReading.matchAll(/https:\/\/doi\.org\/([^\s)\]]+)/g)].map(
      (match) => match[1],
    )
    const uniqueDois = [...new Set(citedDois)]
    assert(uniqueDois.length >= 2 && uniqueDois.length <= 3, `${sourcePath}: expected 2–3 DOI references`)
    assert(
      JSON.stringify(uniqueDois) === JSON.stringify(definition.dois),
      `${sourcePath}: primary DOI set changed without updating verification`,
    )
    articles.push({ ...source, definition })
  }
  return articles
}

async function verifyParamDocs() {
  const files = (await readdir(PARAM_SOURCE_DIR)).filter((file) => file.endsWith('.md'))
  const byId = new Map()
  for (const file of files) {
    const sourcePath = path.join(PARAM_SOURCE_DIR, file)
    const parsed = parseFrontMatter(await readFile(sourcePath, 'utf8'), sourcePath)
    const id = parsed.metadata.id
    assert(id, `${sourcePath}: missing id`)
    assert(!byId.has(id), `${sourcePath}: duplicate parameter id ${id}`)
    byId.set(id, { ...parsed, sourcePath })
  }

  for (const id of PARAM_IDS) {
    const doc = byId.get(id)
    assert(doc, `Missing parameter documentation for ${id}`)
    assert(doc.metadata.title, `${doc.sourcePath}: missing title`)
    assert(doc.metadata.compareWith, `${doc.sourcePath}: missing compareWith metadata`)
    const headings = [...doc.body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim())
    assert(
      JSON.stringify(headings) ===
        JSON.stringify(['Physical meaning', 'Failure modes', 'Compare with']),
      `${doc.sourcePath}: parameter sections are incomplete or out of order`,
    )
    const physics = extractSection(doc.body, 'Physical meaning', 'Failure modes')
    const failures = extractSection(doc.body, 'Failure modes', 'Compare with')
    const comparison = extractSection(doc.body, 'Compare with')
    assert(physics.length >= 120, `${doc.sourcePath}: physical meaning is too short`)
    assert((failures.match(/^-\s+/gm) || []).length >= 2, `${doc.sourcePath}: needs at least two failure modes`)
    assert(comparison.length >= 40, `${doc.sourcePath}: compare-with guidance is too short`)
  }

  const undocumented = [...byId.keys()].filter((id) => !PARAM_IDS.includes(id))
  assert(undocumented.length === 0, `Unexpected parameter documentation IDs: ${undocumented.join(', ')}`)
}

async function verifyGeneratedPages(articles, { siteUrl, expectNewsletter, newsletterAction }) {
  const articlePages = []
  for (const article of articles) {
    const { metadata, definition } = article
    const outputPath = path.join(PUBLIC_DIR, 'case-studies', definition.slug, 'index.html')
    const html = await readFile(outputPath, 'utf8')
    articlePages.push({ outputPath, html })
    assert(html.startsWith('<!doctype html>'), `${outputPath}: not a static HTML document`)
    assert(html.includes(`<title>${metadata.title}</title>`), `${outputPath}: title metadata mismatch`)
    assert(extractMeta(html, 'description') === metadata.description, `${outputPath}: description mismatch`)
    const canonical = `${siteUrl}${metadata.canonical}`
    assert(extractCanonical(html) === canonical, `${outputPath}: canonical URL mismatch`)
    assert(extractMeta(html, 'og:title', 'property') === metadata.title, `${outputPath}: og:title mismatch`)
    assert(extractMeta(html, 'og:description', 'property') === metadata.description, `${outputPath}: og:description mismatch`)
    assert(extractMeta(html, 'og:url', 'property') === canonical, `${outputPath}: og:url mismatch`)
    assert(html.includes(`href="/?preset=${definition.preset}"`), `${outputPath}: generated preset link missing`)
    assert(html.includes('<h1>') && html.includes('<h2>1. Phenomenon'), `${outputPath}: no-JS body missing`)
    const jsonLd = extractJsonLd(html, outputPath)
    assert(jsonLd['@type'] === 'TechArticle', `${outputPath}: JSON-LD type mismatch`)
    assert(jsonLd.headline === metadata.title, `${outputPath}: JSON-LD headline mismatch`)
    assert(jsonLd.description === metadata.description, `${outputPath}: JSON-LD description mismatch`)
    assert(jsonLd.url === canonical && jsonLd.mainEntityOfPage === canonical, `${outputPath}: JSON-LD URL mismatch`)
    assert(jsonLd.datePublished === metadata.datePublished, `${outputPath}: JSON-LD publish date mismatch`)
    assert(jsonLd.dateModified === metadata.dateModified, `${outputPath}: JSON-LD modified date mismatch`)
    assertNoRemoteAutomaticResources(html, outputPath)
    verifyNewsletter(html, outputPath, expectNewsletter, newsletterAction)
  }

  const indexPath = path.join(PUBLIC_DIR, 'case-studies', 'index.html')
  const indexHtml = await readFile(indexPath, 'utf8')
  for (const { definition } of articles) {
    assert(indexHtml.includes(`/case-studies/${definition.slug}/`), `${indexPath}: missing article link`)
    assert(indexHtml.includes(`/?preset=${definition.preset}`), `${indexPath}: missing preset link`)
  }
  assert(extractCanonical(indexHtml) === `${siteUrl}/case-studies/`, `${indexPath}: canonical mismatch`)
  const indexLd = extractJsonLd(indexHtml, indexPath)
  assert(indexLd['@type'] === 'CollectionPage', `${indexPath}: JSON-LD type mismatch`)
  assert(indexLd.mainEntity.itemListElement.length === 3, `${indexPath}: JSON-LD item count mismatch`)
  assertNoRemoteAutomaticResources(indexHtml, indexPath)
  verifyNewsletter(indexHtml, indexPath, expectNewsletter, newsletterAction)

  const trustPath = path.join(PUBLIC_DIR, 'trust', 'index.html')
  const trustHtml = await readFile(trustPath, 'utf8')
  const packageJson = JSON.parse(await readFile(path.join(ROOT_DIR, 'package.json'), 'utf8'))
  const dependencyMatches = [...trustHtml.matchAll(/data-runtime-dependency="([^"]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)]
  const renderedDependencies = Object.fromEntries(
    dependencyMatches.map((match) => [htmlDecode(match[1]), htmlDecode(match[2])]),
  )
  assert(
    JSON.stringify(Object.entries(renderedDependencies).sort()) ===
      JSON.stringify(Object.entries(packageJson.dependencies || {}).sort()),
    `${trustPath}: runtime dependency list differs from package.json`,
  )
  for (const phrase of [
    'Network',
    'Preserve log',
    'Disable cache',
    'Domain',
    'Initiator',
    'Pages Web Analytics / Browser Insights',
    'Zaraz auto-injection',
    'Speed Brain',
    'Prefetch URLs',
    'Bot Management JavaScript Detections / Bot Fight Mode injection',
    'Rocket Loader',
    'Email Address Obfuscation',
    'Cloudflare Fonts',
  ]) {
    assert(trustHtml.includes(phrase), `${trustPath}: missing verification detail ${phrase}`)
  }
  assert(!trustHtml.includes('<form'), `${trustPath}: trust page must not contain a newsletter form`)
  assertNoRemoteAutomaticResources(trustHtml, trustPath)
  extractJsonLd(trustHtml, trustPath)

  const sitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml')
  const sitemap = await readFile(sitemapPath, 'utf8')
  for (const pathname of [
    '/',
    '/case-studies/',
    '/trust/',
    ...articles.map(({ metadata }) => metadata.canonical),
  ]) {
    assert(sitemap.includes(`<loc>${siteUrl}${pathname}</loc>`), `${sitemapPath}: missing ${pathname}`)
  }

  const cssPath = path.join(PUBLIC_DIR, 'content.css')
  const css = await readFile(cssPath, 'utf8')
  assert(!/@import\s/i.test(css), `${cssPath}: remote/imported CSS is not allowed`)
  assert(!/url\(\s*["']?(?:https?:)?\/\//i.test(css), `${cssPath}: remote CSS resource is not allowed`)
  assert(css.includes('/assets/content-ibm-plex-sans-latin-wght.woff2'), `${cssPath}: self-hosted font missing`)
  const fontPath = path.join(PUBLIC_DIR, 'assets', 'content-ibm-plex-sans-latin-wght.woff2')
  assert((await stat(fontPath)).size > 10_000, `${fontPath}: font asset missing or unexpectedly small`)
}

function verifyNewsletter(html, sourcePath, expectNewsletter, newsletterAction) {
  const csp = extractMeta(html, 'Content-Security-Policy', 'http-equiv')
  assert(csp, `${sourcePath}: missing CSP metadata`)
  if (expectNewsletter) {
    assert(html.includes('<form method="post"'), `${sourcePath}: configured newsletter form missing`)
    assert(html.includes(`action="${newsletterAction}"`), `${sourcePath}: newsletter action mismatch`)
    assert(html.includes('name="email"'), `${sourcePath}: newsletter email field missing`)
    assert(csp.includes(`form-action 'self' ${new URL(newsletterAction).origin}`), `${sourcePath}: CSP does not allow configured form origin`)
  } else {
    assert(!html.includes('<form'), `${sourcePath}: form emitted without NEWSLETTER_FORM_ACTION`)
    assert(html.includes('Email updates are unavailable'), `${sourcePath}: honest unavailable message missing`)
    assert(csp.includes("form-action 'none'"), `${sourcePath}: unconfigured form CSP must deny submissions`)
  }
}

async function main() {
  const articles = await verifyArticleSources()
  await verifyParamDocs()

  const testSiteUrl = 'https://content-verification.test'
  const testAction = 'https://newsletter-endpoint.test/subscribe'
  let primaryFailure = null
  try {
    verifyCloudflareSiteUrlRequired()
    verifyInsecureNewsletterRejected(testSiteUrl)
    runBuild({ siteUrl: testSiteUrl, newsletterAction: null })
    await verifyGeneratedPages(articles, {
      siteUrl: testSiteUrl,
      expectNewsletter: false,
      newsletterAction: null,
    })

    runBuild({ siteUrl: testSiteUrl, newsletterAction: testAction })
    await verifyGeneratedPages(articles, {
      siteUrl: testSiteUrl,
      expectNewsletter: true,
      newsletterAction: testAction,
    })
  } catch (error) {
    primaryFailure = error
  }

  try {
    runBuild({ restore: true })
  } catch (restoreError) {
    if (primaryFailure) {
      primaryFailure.message += `\nRestoring current-environment output also failed: ${restoreError.message}`
    } else {
      primaryFailure = restoreError
    }
  }

  if (primaryFailure) throw primaryFailure
  console.log(
    `Content verification passed: ${CASES.length} cases, ${PARAM_IDS.length} parameter docs, static SEO/JSON-LD, exact dependencies, newsletter gating, and same-origin automatic resources.`,
  )
}

await main()
