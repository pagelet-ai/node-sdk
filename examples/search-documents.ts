import { Pagelet } from "@pagelet-ai/sdk"

const [query, documentId] = process.argv.slice(2)
if (!query) {
  throw new Error('Usage: npm run search -- "monthly account fees" [document_id]')
}

const client = new Pagelet()
const matches = await client.documents.search({
  query,
  ...(documentId === undefined ? {} : { filters: { documentId } }),
})
const hits = matches.hits.map(({ document, identifier, page }) => ({
  documentId: document.id,
  filename: document.filename,
  identifier,
  page,
}))

console.log(JSON.stringify(hits, null, 2))
