export interface ParamDoc {
  id: string
  title: string
  physics: string
  failureModes: string[]
  compareWith?: string
  relatedArticle?: string
}

function parseFrontMatter(markdown: string): { metadata: Record<string, string>; body: string } {
  if (!markdown.startsWith('---\n')) return { metadata: {}, body: markdown }
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return { metadata: {}, body: markdown }
  const metadata = Object.fromEntries(
    markdown.slice(4, end).split('\n').map((line) => {
      const separator = line.indexOf(':')
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : [line.trim(), '']
    }),
  )
  return { metadata, body: markdown.slice(end + 5) }
}

function section(body: string, heading: string): string {
  const expression = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$)`, 'mi')
  return expression.exec(body)?.[1]?.trim() ?? ''
}

function cleanInline(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
}

function parseParamDoc(markdown: string): ParamDoc {
  const { metadata, body } = parseFrontMatter(markdown)
  const failures = section(body, 'Failure modes')
    .split('\n')
    .filter((line) => /^[-*]\s+/u.test(line))
    .map((line) => cleanInline(line.replace(/^[-*]\s+/u, '')))
  return {
    id: metadata.id ?? '',
    title: metadata.title ?? metadata.id ?? 'Parameter',
    physics: cleanInline(section(body, 'Physical meaning')),
    failureModes: failures,
    compareWith: cleanInline(section(body, 'Compare with')) || undefined,
    relatedArticle: metadata.relatedArticle || undefined,
  }
}

const sources = import.meta.glob('./params/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const documents = Object.values(sources).map(parseParamDoc).filter((document) => document.id)

export const PARAM_DOCS = new Map(documents.map((document) => [document.id, document]))
