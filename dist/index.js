// src/errors.ts
var PageletError = class extends Error {
  code;
  status;
  requestId;
  details;
  /** Creates one stable SDK error shape without exposing credentials or document bytes. */
  constructor(input) {
    super(input.message, { cause: input.cause });
    this.name = "PageletError";
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.details = input.details;
  }
};
function productApiError(status, response) {
  const error = response?.error;
  if (error === void 0) {
    return new PageletError({
      code: "request_failed",
      message: "The Product API request failed.",
      status
    });
  }
  return new PageletError({
    code: error.code,
    message: error.message,
    status,
    requestId: error.details.request_id,
    details: error.details
  });
}

// src/sdk.ts
import { randomUUID } from "node:crypto";
import { openAsBlob } from "node:fs";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pRetry from "p-retry";
var productApiUrls = {
  production: "https://api.pagelet.ai",
  staging: "https://api.staging.pagelet.ai"
};
var productApiTimeoutMs = 35e3;
var completionTimeoutMs = 10 * 60 * 1e3;
var pollingIntervalMs = 2e3;
var maxTimerDelayMs = 2147483647;
var retryableStatuses = {
  productApi: /* @__PURE__ */ new Set([408, 500, 502, 503, 504]),
  transfer: /* @__PURE__ */ new Set([408, 409, 500, 502, 503, 504])
};
var retryOptions = {
  retries: 2,
  factor: 2,
  minTimeout: 250,
  maxTimeout: 1e3,
  randomize: true
};
var Pagelet = class {
  #apiKey;
  #baseUrl;
  documents = {
    /** Lists one page of retained Documents, optionally matching external identifiers exactly. */
    list: (options = {}) => {
      const { filters = {} } = options;
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries({
        external_id: filters.externalId,
        external_group_id: filters.externalGroupId,
        order: options.order,
        page_start: options.pageStart,
        page_limit: options.pageLimit
      })) {
        if (value !== void 0) {
          query.set(name, String(value));
        }
      }
      for (const category of filters.categories ?? []) {
        query.append("categories", category);
      }
      return this.#request(`/v1/documents${query.size ? `?${query}` : ""}`, {
        method: "GET",
        signal: options.signal
      });
    },
    /** Uploads one Document, waits for recovery and requested classification, and collects its result. */
    create: async (input) => {
      const timeoutMs = input.timeoutMs ?? completionTimeoutMs;
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maxTimerDelayMs) {
        throw new TypeError(`timeoutMs must be an integer between 1 and ${maxTimerDelayMs}.`);
      }
      const job = await this.#createJob(input);
      return this.#waitForResult(job, { timeoutMs, signal: input.signal });
    },
    /** Returns a retained Document's details, including its current processing status. */
    get: (documentId, options = {}) => {
      return this.#request(`/v1/documents/${encodeURIComponent(documentId)}`, {
        method: "GET",
        signal: options.signal
      });
    },
    /** Collects available Document content, or one explicitly requested Page window, without waiting. */
    result: (documentId, options = {}) => {
      return this.#result(`/v1/documents/${encodeURIComponent(documentId)}/result`, options);
    },
    /** Returns one Page's recovered content and available source-image access. */
    page: (documentId, pageNumber, options = {}) => {
      return this.#request(`/v1/documents/${encodeURIComponent(documentId)}/pages/${pageNumber}`, {
        method: "GET",
        signal: options.signal
      });
    },
    /** Finds Documents or Pages within one Document, in server-selected order. */
    search: (input) => {
      return this.#request("/v1/documents/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: input.query,
          filters: input.filters ? {
            document_id: input.filters.documentId,
            external_id: input.filters.externalId,
            external_group_id: input.filters.externalGroupId
          } : void 0,
          limit: input.limit
        }),
        signal: input.signal
      });
    }
  };
  jobs = {
    /** Uploads and confirms one Document, returning Job status without waiting for recovery. */
    create: (input) => {
      return this.#createJob(input);
    },
    /** Returns a Job's current public status. */
    get: (jobId, options = {}) => {
      return this.#request(`/v1/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        signal: options.signal
      });
    },
    /** Collects available content by Job ID, or one requested Page window, without waiting. */
    result: (jobId, options = {}) => {
      return this.#result(`/v1/jobs/${encodeURIComponent(jobId)}/result`, options);
    }
  };
  classifications = {
    /** Requests classification of retained content and returns without waiting. */
    create: (input) => {
      return this.#request(`/v1/documents/${encodeURIComponent(input.documentId)}/classifications`, {
        method: "POST",
        headers: {
          ...input.schema === void 0 ? {} : { "content-type": "application/json" },
          "idempotency-key": input.idempotencyKey ?? randomUUID()
        },
        body: JSON.stringify(input.schema),
        signal: input.signal
      });
    },
    /** Reads one classification's status and result by its original identity. */
    get: (documentId, classificationId, options = {}) => {
      return this.#request(
        `/v1/documents/${encodeURIComponent(documentId)}/classifications/${encodeURIComponent(classificationId)}`,
        { method: "GET", signal: options.signal }
      );
    }
  };
  /** Creates a Product API client for a named deployment environment. */
  constructor(options = {}) {
    const apiKey = options.apiKey === void 0 ? process.env["PAGELET_API_KEY"] : options.apiKey;
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw new TypeError("apiKey must be a non-empty string.");
    }
    const environment = options.environment ?? "production";
    if (environment !== "production" && environment !== "staging") {
      throw new TypeError("environment must be production or staging.");
    }
    this.#apiKey = apiKey;
    this.#baseUrl = productApiUrls[environment];
  }
  /** Owns the shared submission sequence and one stable idempotency key. */
  async #createJob(input) {
    const filename = documentFilename(input);
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const webhook = typeof input.webhookUrl === "string" ? { url: input.webhookUrl } : input.webhookUrl;
    const metadata = {
      external_id: input.externalId,
      external_group_id: input.externalGroupId
    };
    const { upload_id: uploadId, upload: instructions } = await this.#request("/v1/uploads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify({ filename, classification: input.classification, webhook, metadata }),
      signal: input.signal
    });
    await this.#transfer({ file: input.file, instructions, signal: input.signal });
    return this.#request(`/v1/uploads/${encodeURIComponent(uploadId)}/confirm`, {
      method: "POST",
      signal: input.signal
    });
  }
  /** Bounds local polling and collection without cancelling the admitted server work. */
  async #waitForResult(job, options) {
    const classificationId = job.classification?.id;
    const deadline = new AbortController();
    const timer = setTimeout(() => {
      deadline.abort(
        new PageletError({
          code: "completion_timeout",
          message: "Document completion timed out. Processing may still be running.",
          details: { job_id: job.id }
        })
      );
    }, options.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
    try {
      while (!isResultReady(job, classificationId)) {
        if (!job.result_available && ["failed", "rejected"].includes(job.status)) {
          const detail = job.detail;
          throw new PageletError({
            code: detail.code,
            message: detail.message,
            details: { ...detail, job_id: job.id }
          });
        }
        await delay(pollingIntervalMs, void 0, { signal });
        job = await this.jobs.get(job.id, { signal });
      }
      return await this.jobs.result(job.id, { signal });
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  /** Follows the API's ordered Page windows while retaining the first response's metadata snapshot. */
  async #result(path, options) {
    const query = new URLSearchParams();
    if (options.pageStart !== void 0) {
      query.set("page_start", String(options.pageStart));
    }
    if (options.pageLimit !== void 0) {
      query.set("page_limit", String(options.pageLimit));
    }
    const suffix = query.size ? `?${query}` : "";
    const { pagination, ...result } = await this.#request(`${path}${suffix}`, {
      method: "GET",
      signal: options.signal
    });
    if (options.pageStart !== void 0 || options.pageLimit !== void 0) {
      return result;
    }
    let nextStart = pagination.next_start;
    while (nextStart !== null) {
      const page = await this.#request(`${path}?page_start=${nextStart}`, {
        method: "GET",
        signal: options.signal
      });
      result.pages.push(...page.pages);
      nextStart = page.pagination.next_start;
    }
    return result;
  }
  /** Transfers one file through the API-provided signed PUT destination. */
  async #transfer(input) {
    await retryOperation(
      async () => {
        let response;
        try {
          response = await fetch(input.instructions.url, {
            method: input.instructions.method,
            headers: input.instructions.headers,
            body: typeof input.file === "string" ? await openAsBlob(input.file) : input.file,
            signal: input.signal ?? null
          });
          await response.body?.cancel();
        } catch (cause) {
          throw new PageletError({
            code: "document_transfer_failed",
            message: "Document transfer failed.",
            cause
          });
        }
        if (isAcceptedTransferResponse(response)) {
          return;
        }
        throw new PageletError({
          code: "document_transfer_failed",
          message: `Document transfer returned HTTP ${response.status}.`,
          status: response.status
        });
      },
      input.signal,
      isRetryableTransferFailure
    );
  }
  /** Sends one authenticated request with the SDK's Product API timeout. */
  #request(path, request) {
    return retryOperation(
      async () => {
        const timeoutSignal = AbortSignal.timeout(productApiTimeoutMs);
        const signal = request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal;
        let response;
        let body;
        try {
          response = await fetch(new URL(path, this.#baseUrl), {
            method: request.method,
            headers: {
              accept: "application/json",
              authorization: `Bearer ${this.#apiKey}`,
              ...request.headers
            },
            ...request.body === void 0 ? {} : { body: request.body },
            signal
          });
          body = await response.json();
        } catch (cause) {
          if (timeoutSignal.aborted) {
            throw new PageletError({
              code: "request_timeout",
              message: "The Product API request timed out.",
              cause: timeoutSignal.reason
            });
          }
          throw new PageletError({
            code: "request_failed",
            message: "The Product API request failed.",
            cause
          });
        }
        if (!response.ok) {
          throw productApiError(response.status, body);
        }
        return body;
      },
      request.signal,
      isRetryableProductApiFailure
    );
  }
};
function isResultReady(job, classificationId) {
  const classification = job.classification;
  const waitingForClassification = classification && classification.id === classificationId && ["pending", "processing"].includes(classification.status);
  return job.result_available && !waitingForClassification;
}
function documentFilename(input) {
  if (input.filename !== void 0) {
    return input.filename;
  }
  if (typeof input.file === "string") {
    return basename(input.file);
  }
  if (input.file instanceof File) {
    return input.file.name;
  }
  throw new TypeError("filename is required when file has no name.");
}
async function retryOperation(operation, signal, isRetryable) {
  try {
    return await pRetry(operation, {
      ...retryOptions,
      signal,
      shouldRetry: ({ error }) => isRetryable(error)
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
}
function isRetryableProductApiFailure(error) {
  if (!(error instanceof PageletError)) {
    return false;
  }
  if (error.status !== void 0) {
    return retryableStatuses.productApi.has(error.status);
  }
  return error.code === "request_failed" || error.code === "request_timeout";
}
function isAcceptedTransferResponse(response) {
  return response.ok || response.status === 412;
}
function isRetryableTransferFailure(error) {
  if (!(error instanceof PageletError) || error.code !== "document_transfer_failed") {
    return false;
  }
  return error.status === void 0 || retryableStatuses.transfer.has(error.status);
}
export {
  Pagelet,
  PageletError
};
//# sourceMappingURL=index.js.map
