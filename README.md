# @pagelet-ai/sdk

The Node.js SDK for [Pagelet](https://pagelet.ai). Convert documents to page-by-page Markdown, classify them, and search their retained content.

## Install

Requires Node.js 22 or later. Use the SDK in your backend or local scripts, and keep your API key out of browser code.

```sh
npm install @pagelet-ai/sdk
```

Create an API key in your [Pagelet workspace](https://portal.pagelet.ai) with `uploads:create`, `jobs:read`, and `results:read` permissions, then set it in your environment:

```sh
export PAGELET_API_KEY=your_api_key
```

Use your own document, or download the [sample statement](https://pagelet.ai/docs/samples/statement.pdf) as `statement.pdf`.

## Choose a processing mode

Both methods return Promises. Choose when you want the call to return:

| Method             | Waits for                                                  | Returns           |
| ------------------ | ---------------------------------------------------------- | ----------------- |
| `documents.create` | Upload, recovery, requested classification, and collection | Document result   |
| `jobs.create`      | Upload and confirmation                                    | Job ID and status |

### Wait for the result

Upload the statement and save its result:

```ts
import { writeFile } from "node:fs/promises"
import { Pagelet } from "@pagelet-ai/sdk"

const client = new Pagelet()
const result = await client.documents.create({ file: "statement.pdf" })

await writeFile("statement.json", JSON.stringify(result, null, 2))
```

`documents.create` uploads the file, waits for recovery and any requested classification, and collects the result. It includes ordered pages with Markdown, Document and Job IDs, and warnings for content that needs attention.

An available result can include failed pages. Check `document.content_status` and `warnings` before using the content: `markdown: null` means recovery failed for that page, while `""` is a recovered blank page. Saving the complete JSON preserves these distinctions. See [read and use results](https://pagelet.ai/docs/results).

The client reads `PAGELET_API_KEY` automatically and uses `https://api.pagelet.ai`. You can also pass `apiKey` explicitly. The classification, retained-content, and Search snippets reuse this `client` and `result`; the background and later-read examples include their own setup.

### Process in the background

Run this submission once. It returns without waiting for recovery and saves the Job ID:

```ts
import { writeFile } from "node:fs/promises"
import { Pagelet } from "@pagelet-ai/sdk"

const client = new Pagelet()
const job = await client.jobs.create({
  file: "statement.pdf",
  externalId: "statement-2026-09",
})

await writeFile("job-id.txt", job.id)
```

Run this separate script later to load the saved ID and check that Job. It does not upload the file again:

```ts
import { readFile, writeFile } from "node:fs/promises"
import { Pagelet } from "@pagelet-ai/sdk"

const client = new Pagelet()
const jobId = (await readFile("job-id.txt", "utf8")).trim()
const status = await client.jobs.get(jobId)

if (status.result_available) {
  const content = await client.jobs.result(jobId)
  await writeFile("statement.json", JSON.stringify(content, null, 2))
} else {
  console.log("Job:", status.id, status.status)
}
```

Status and result reads return without waiting. Requested classification can still be running when recovered content becomes available. See [background processing](https://pagelet.ai/docs/background-processing) for webhooks and result readiness.

## Classify during upload

Supply your categories and the evidence they should match:

```ts
const classified = await client.documents.create({
  file: "statement.pdf",
  classification: [
    { category: "Bank statement", criteria: ["Lists bank account transactions and opening and closing balances."] },
  ],
})

console.log(classified.classification?.status, classified.classification?.categories)
```

Omit `classification` to use your workspace defaults, or pass `null` to skip it. Creation waits for the requested classification. If classification fails, recovered content remains available with a warning. Categories are final only when the classification status is `completed`; an empty array means no categories matched.

## Read retained content

Use a saved Document ID to read its content again. Result reads collect all pages by default; pass a range to retrieve one window:

```ts
const firstPages = await client.documents.result(result.document.id, {
  pageStart: 1,
  pageLimit: 3,
})

console.log(firstPages.pages)
```

## Classify retained content

Start a classification without uploading the document again, and save both IDs for later reads:

```ts
const classification = await client.classifications.create({
  documentId: result.document.id,
  schema: [{ category: "Bank fees", criteria: ["Lists bank fees or service charges."] }],
})

await writeFile("document-id.txt", result.document.id)
await writeFile("classification-id.txt", classification.id)
```

Creation returns without waiting. Run this separate script later to read the request using both saved IDs:

```ts
import { readFile } from "node:fs/promises"
import { Pagelet } from "@pagelet-ai/sdk"

const client = new Pagelet()
const classificationId = (await readFile("classification-id.txt", "utf8")).trim()
const documentId = (await readFile("document-id.txt", "utf8")).trim()
const outcome = await client.classifications.get(documentId, classificationId)

console.log(JSON.stringify(outcome, null, 2))
```

Repeat the read later while status is `pending` or `processing`. `categories: null` is not a completed result; completed `[]` means no match. The API key needs `results:read` and `classifications:create` permissions. See [classification results](https://pagelet.ai/docs/classify#understand-the-result) for evaluated pages and failure details.

## Search documents and pages

Search across your workspace and inspect the matching documents:

```ts
const matches = await client.documents.search({ query: "monthly account fees" })
const hits = matches.hits.map(({ document, identifier, page }) => ({
  documentId: document.id,
  filename: document.filename,
  identifier,
  page,
}))

console.log(JSON.stringify(hits, null, 2))
```

To find pages within the statement, restrict the search to its Document ID:

```ts
const pageMatches = await client.documents.search({
  query: '"monthly service fee"',
  filters: { documentId: result.document.id },
})
const pages = pageMatches.hits.map(({ page }) => page)

console.log(JSON.stringify(pages, null, 2))
```

Search requires a Growth or Team workspace and `results:read` permission. New content can take a little longer to become searchable; no hits does not establish that the content is absent. Workspace hits can match identifiers or filenames without a page excerpt. See [Search](https://pagelet.ai/docs/search) for query syntax and filters.

## Errors and cancellation

API errors, request failures, and completion timeouts use `PageletError`. Invalid local configuration or arguments can throw `TypeError`. A completion timeout includes the existing Job ID so you can check progress without submitting the file again:

```ts
import { PageletError } from "@pagelet-ai/sdk"

try {
  await client.documents.create({ file: "statement.pdf" })
} catch (error) {
  if (error instanceof PageletError && error.code === "completion_timeout") {
    console.error("Completion wait ended. Job ID:", error.details?.["job_id"])
  }

  throw error
}
```

The completion deadline defaults to ten minutes after upload confirmation and includes requested classification and result collection. Reaching it leaves admitted server processing running.

Every operation accepts an `AbortSignal`. For example, stop waiting for a content read after five seconds:

```ts
await client.documents.result(result.document.id, {
  signal: AbortSignal.timeout(5_000),
})
```

Local cancellation preserves the signal's abort reason and leaves admitted server processing running. See [errors and retries](https://pagelet.ai/docs/errors-and-retries) for error codes, automatic retries, and recovery.

## Runnable examples

The [example project](https://github.com/pagelet-ai/node-sdk/tree/main/examples) includes two programs: process a document and save its result, or search retained documents and pages. From the project's `examples` directory:

```sh
npm install
curl -fL https://pagelet.ai/docs/samples/statement.pdf -o statement.pdf
npm run process -- statement.pdf statement.json
npm run search -- "monthly account fees"
```

Use the Document ID printed by `process` to search within that document:

```sh
npm run search -- '"monthly service fee"' doc_id
```

See the [Pagelet documentation](https://pagelet.ai/docs) and [SDK reference](https://pagelet.ai/docs/sdk-reference) for the complete API.

## License

[Apache-2.0](LICENSE)
