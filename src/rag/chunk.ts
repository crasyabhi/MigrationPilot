import { createHash } from 'node:crypto'
import { load, type CheerioAPI } from 'cheerio'
import type { CorpusPage } from './corpus'

export type DocumentChunk = {
  sourceUrl: string
  title: string
  section: string
  service: string
  migrationTopic: string
  content: string
  contentHash: string
}

type Block = { text: string; words: number }

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function articleBlocks($: CheerioAPI, root: ReturnType<CheerioAPI>): Array<{ tag: string; text: string; anchor?: string }> {
  const blocks: Array<{ tag: string; text: string; anchor?: string }> = []

  for (const element of root.find('h1, h2, h3, h4, p, li, pre').toArray()) {
    const selected = $(element)
    if (selected.parents('p, li, pre').length) continue
    const tag = element.name.toLowerCase()
    const text = tag === 'pre' ? selected.text().trim() : cleanText(selected.text())
    if (text) blocks.push({ tag, text, anchor: selected.attr('id') })
  }
  return blocks
}

export function chunksFromHtml(html: string, page: CorpusPage): DocumentChunk[] {
  const $ = load(html)
  const article = $('#main-col-body')
  if (!article.length) throw new Error(`AWS article body was not found: ${page.url}`)
  article.find('script, style, nav, button, svg').remove()

  const blocks = articleBlocks($, article)
  const title = blocks.find((block) => block.tag === 'h1')?.text ?? ''
  if (!title) throw new Error(`AWS article title was not found: ${page.url}`)

  const chunks: DocumentChunk[] = []
  const headings: string[] = []
  let sectionBlocks: Block[] = []
  let sectionAnchor: string | undefined

  function flush(): void {
    if (!sectionBlocks.length || !headings.length) return
    const section = headings.join(' > ')
    const content = sectionBlocks.map((block) => block.text).join('\n\n')
    const sourceUrl = sectionAnchor ? `${page.url}#${sectionAnchor}` : page.url
    const contentHash = createHash('sha256')
      .update(JSON.stringify([page.url, section, content]))
      .digest('hex')
    chunks.push({
      sourceUrl,
      title,
      section,
      service: page.service,
      migrationTopic: page.topicForSection(section),
      content,
      contentHash,
    })
    sectionBlocks = []
  }

  for (const block of blocks) {
    if (/^h[1-4]$/.test(block.tag)) {
      flush()
      const level = Number(block.tag[1])
      headings.length = level - 1
      headings[level - 1] = block.text
      sectionAnchor = block.anchor
      continue
    }

    if (!headings.length) continue
    const next = { text: block.text, words: wordCount(block.text) }
    const wordsSoFar = sectionBlocks.reduce((sum, item) => sum + item.words, 0)
    if (sectionBlocks.length && wordsSoFar + next.words > 900) flush()
    sectionBlocks.push(next)
  }
  flush()

  if (!chunks.length) throw new Error(`AWS article had no useful sections: ${page.url}`)
  return chunks
}
