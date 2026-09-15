import { corpusPages } from './corpus'
import { chunksFromHtml, type DocumentChunk } from './chunk'

export async function fetchCorpusChunks(): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = []

  for (const page of corpusPages) {
    const response = await fetch(page.url, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`AWS documentation fetch failed (${response.status}): ${page.url}`)
    if (!response.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`AWS documentation was not HTML: ${page.url}`)
    }
    const pageChunks = chunksFromHtml(await response.text(), page)
    console.log(`${page.url}: ${pageChunks.length} chunks`)
    chunks.push(...pageChunks)
  }

  return chunks
}
