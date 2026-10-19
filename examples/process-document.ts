import { writeFile } from "node:fs/promises"

import { Pagelet, PageletError } from "@pagelet-ai/sdk"

const [file, output = "result.json"] = process.argv.slice(2)
if (!file) {
  throw new Error("Usage: npm run process -- statement.pdf statement.json")
}

const client = new Pagelet()

try {
  const result = await client.documents.create({ file })
  await writeFile(output, JSON.stringify(result, null, 2))
  console.log("Saved Document", result.document.id, "to", output)
  console.log("Content:", result.document.content_status, "Warnings:", result.warnings.length)
} catch (error) {
  if (error instanceof PageletError && error.code === "completion_timeout") {
    console.error("Completion wait ended. Job ID:", error.details?.["job_id"])
  }

  throw error
}
