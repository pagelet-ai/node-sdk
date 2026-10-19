/** A Product API, Document transfer, or completion failure with safe recovery details. */
export declare class PageletError extends Error {
	readonly code: string;
	readonly status: number | undefined;
	readonly requestId: string | undefined;
	readonly details: Readonly<Record<string, unknown>> | undefined;
	/** Creates one stable SDK error shape without exposing credentials or document bytes. */
	constructor(input: {
		code: string;
		message: string;
		status?: number;
		requestId?: string;
		details?: Readonly<Record<string, unknown>>;
		cause?: unknown;
	});
}
type TypeId<T> = string & {
	__type: T;
};
declare const IdPrefixes: {
	readonly tenant: "tenant";
	readonly user: "usr";
	readonly job: "job";
	readonly upload: "upl";
	readonly document: "doc";
	readonly classification: "cls";
	readonly webhookEvent: "evt";
	readonly request: "req";
};
type IdKind = keyof typeof IdPrefixes;
type IdPrefix<Kind extends IdKind = IdKind> = (typeof IdPrefixes)[Kind];
type ProductId<Kind extends IdKind> = TypeId<IdPrefix<Kind>>;
declare const productApiUrls: {
	readonly production: "https://api.pagelet.ai";
	readonly staging: "https://api.staging.pagelet.ai";
};
export interface PageletOptions {
	apiKey?: string;
	environment?: keyof typeof productApiUrls;
}
export interface JobCreateInput {
	/** A local path or in-memory `File`, `Blob`, `Uint8Array`, or `Buffer`. */
	file: string | Blob | Uint8Array;
	/** Overrides a path or File name and is required for nameless Blob and byte inputs. */
	filename?: string;
	/** Criteria to evaluate after recovery. Omit to use the workspace default; null skips classification. */
	classification?: ClassificationSchema | null;
	/** Your application's identifier for this Document. */
	externalId?: string;
	/** Your application's identifier for a group of related Documents. */
	externalGroupId?: string;
	/** Omit to use the workspace default; null disables delivery for this document. */
	webhookUrl?: string | null;
	idempotencyKey?: string;
	signal?: AbortSignal;
}
export interface DocumentCreateInput extends JobCreateInput {
	/** Completion deadline after confirmation, including result collection. Defaults to ten minutes. */
	timeoutMs?: number;
}
export interface ClassificationCreateInput {
	documentId: string;
	/** Omit to use the workspace's saved classification schema. */
	schema?: ClassificationSchema;
	idempotencyKey?: string;
	signal?: AbortSignal;
}
export interface ResultOptions {
	pageStart?: number;
	pageLimit?: number;
	signal?: AbortSignal;
}
export interface DocumentListOptions {
	filters?: {
		externalId?: string;
		externalGroupId?: string;
		categories?: string[];
	};
	order?: "newest" | "active";
	pageStart?: number;
	pageLimit?: number;
	signal?: AbortSignal;
}
export interface DocumentSearchInput {
	query: string;
	filters?: {
		documentId?: string;
		externalId?: string;
		externalGroupId?: string;
	};
	limit?: number;
	signal?: AbortSignal;
}
export type DocumentResult = Awaited<ReturnType<Pagelet["documents"]["result"]>>;
type ClassificationSchema = Awaited<ReturnType<Pagelet["classifications"]["get"]>>["schema"];
/** A server-side client for the Pagelet Product API. */
export declare class Pagelet {
	#private;
	readonly documents: {
		/** Lists one page of retained Documents, optionally matching external identifiers exactly. */
		list: (options?: DocumentListOptions) => Promise<{
			documents: {
				status: "completed" | "failed" | "processing" | "waiting_for_upload" | "validating" | "completed_with_warnings" | "rejected";
				detail: {
					code: string;
					message: string;
					stage?: "upload" | "planning" | "validation" | "scan" | "extraction" | "finalization" | undefined;
					required_pages?: number | undefined;
				} | null;
				completed_at: string | null;
				progress: {
					pages_total: number;
					pages_completed: number;
				} | null;
				id: ProductId<"document">;
				filename: string;
				confidence_score: number | null;
				webhook: {
					status: "failed" | "pending" | "sending" | "delivered";
				} | null;
				classification: {
					id: ProductId<"classification">;
					status: "completed" | "failed" | "pending" | "processing";
					categories: string[] | null;
				} | null;
				thumbnail: {
					url: string;
					expires_at: string;
				} | null;
				created_at: string;
			}[];
			categories: string[];
			pagination: {
				page_start: number;
				page_limit: number;
				next_start: number | null;
			};
		}>;
		/** Uploads one Document, waits for recovery and requested classification, and collects its result. */
		create: (input: DocumentCreateInput) => Promise<{
			job: {
				id: ProductId<"job">;
				status: "completed" | "failed" | "completed_with_warnings";
			};
			document: {
				id: ProductId<"document">;
				filename: string;
				media_type: string;
				page_count: number;
				content_status: "available" | "partially_available" | "unavailable";
				confidence_score: number;
			};
			pages: {
				page_number: number;
				markdown: string | null;
				confidence_score: number;
				warnings: {
					message: string;
					code: "page_extraction_failed";
				}[];
			}[];
			warnings: {
				code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large" | "page_extraction_failed";
				message: string;
			}[];
			classification?: {
				id: ProductId<"classification">;
				status: "completed" | "failed" | "pending" | "processing";
				document_id: ProductId<"document"> | null;
				schema: {
					category: string;
					criteria: string[];
				}[];
				categories: string[] | null;
				evaluated_pages: number[];
				detail: {
					code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large";
					message: string;
				} | null;
				created_at: string;
				updated_at: string;
				completed_at: string | null;
			} | undefined;
		}>;
		/** Returns a retained Document's details, including its current processing status. */
		get: (documentId: string, options?: {
			signal?: AbortSignal;
		}) => Promise<{
			status: "completed" | "failed" | "processing" | "waiting_for_upload" | "validating" | "completed_with_warnings" | "rejected";
			detail: {
				code: string;
				message: string;
				stage?: "upload" | "planning" | "validation" | "scan" | "extraction" | "finalization" | undefined;
				required_pages?: number | undefined;
			} | null;
			completed_at: string | null;
			progress: {
				pages_total: number;
				pages_completed: number;
			} | null;
			id: ProductId<"document">;
			filename: string;
			confidence_score: number | null;
			thumbnail: {
				url: string;
				expires_at: string;
			} | null;
			created_at: string;
			content_status: "pending" | "processing" | "available" | "partially_available" | "unavailable";
			expires_at: string | null;
			original_download: {
				url: string;
				expires_at: string;
			} | null;
			webhook: {
				destination: string;
				status: "failed" | "pending" | "sending" | "delivered";
				attempt_count: number;
				last_http_status: number | null;
				last_error_code: "request_timeout" | "dns_resolution_failed" | "unsafe_destination" | "kms_unavailable" | "signing_key_invalid" | "network_error" | null;
				next_attempt_at: string | null;
				delivered_at: string | null;
			} | null;
			external_id: string | null;
			external_group_id: string | null;
			classification: {
				id: ProductId<"classification">;
				status: "completed" | "failed" | "pending" | "processing";
				document_id: ProductId<"document"> | null;
				schema: {
					category: string;
					criteria: string[];
				}[];
				categories: string[] | null;
				evaluated_pages: number[];
				detail: {
					code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large";
					message: string;
				} | null;
				created_at: string;
				updated_at: string;
				completed_at: string | null;
			} | null;
		}>;
		/** Collects available Document content, or one explicitly requested Page window, without waiting. */
		result: (documentId: string, options?: ResultOptions) => Promise<{
			job: {
				id: ProductId<"job">;
				status: "completed" | "failed" | "completed_with_warnings";
			};
			document: {
				id: ProductId<"document">;
				filename: string;
				media_type: string;
				page_count: number;
				content_status: "available" | "partially_available" | "unavailable";
				confidence_score: number;
			};
			pages: {
				page_number: number;
				markdown: string | null;
				confidence_score: number;
				warnings: {
					message: string;
					code: "page_extraction_failed";
				}[];
			}[];
			warnings: {
				code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large" | "page_extraction_failed";
				message: string;
			}[];
			classification?: {
				id: ProductId<"classification">;
				status: "completed" | "failed" | "pending" | "processing";
				document_id: ProductId<"document"> | null;
				schema: {
					category: string;
					criteria: string[];
				}[];
				categories: string[] | null;
				evaluated_pages: number[];
				detail: {
					code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large";
					message: string;
				} | null;
				created_at: string;
				updated_at: string;
				completed_at: string | null;
			} | undefined;
		}>;
		/** Returns one Page's recovered content and available source-image access. */
		page: (documentId: string, pageNumber: number, options?: {
			signal?: AbortSignal;
		}) => Promise<{
			page_number: number;
			markdown: string | null;
			confidence_score: number | null;
			image: {
				url: string;
				expires_at: string;
			} | null;
		}>;
		/** Finds Documents or Pages within one Document, in server-selected order. */
		search: (input: DocumentSearchInput) => Promise<{
			hits: {
				document: {
					status: "completed" | "failed" | "processing" | "waiting_for_upload" | "validating" | "completed_with_warnings" | "rejected";
					detail: {
						code: string;
						message: string;
						stage?: "upload" | "planning" | "validation" | "scan" | "extraction" | "finalization" | undefined;
						required_pages?: number | undefined;
					} | null;
					completed_at: string | null;
					progress: {
						pages_total: number;
						pages_completed: number;
					} | null;
					id: ProductId<"document">;
					filename: string;
					confidence_score: number | null;
					webhook: {
						status: "failed" | "pending" | "sending" | "delivered";
					} | null;
					classification: {
						id: ProductId<"classification">;
						status: "completed" | "failed" | "pending" | "processing";
						categories: string[] | null;
					} | null;
					thumbnail: {
						url: string;
						expires_at: string;
					} | null;
					created_at: string;
				};
				identifier: {
					field: "external_id" | "external_group_id";
					value: string;
				} | null;
				page: {
					page_number: number;
					excerpt: string;
				} | null;
			}[];
		}>;
	};
	readonly jobs: {
		/** Uploads and confirms one Document, returning Job status without waiting for recovery. */
		create: (input: JobCreateInput) => Promise<{
			id: ProductId<"job">;
			status: "completed" | "failed" | "processing" | "waiting_for_upload" | "validating" | "completed_with_warnings" | "rejected";
			document_id: ProductId<"document"> | null;
			external_id: string | null;
			external_group_id: string | null;
			progress: {
				pages_total: number;
				pages_completed: number;
			} | null;
			result_available: boolean;
			detail: {
				code: string;
				message: string;
				stage?: "upload" | "planning" | "validation" | "scan" | "extraction" | "finalization" | undefined;
				required_pages?: number | undefined;
			} | null;
			created_at: string;
			updated_at: string;
			completed_at: string | null;
			classification?: {
				id: ProductId<"classification">;
				status: "completed" | "failed" | "pending" | "processing";
			} | undefined;
		}>;
		/** Returns a Job's current public status. */
		get: (jobId: string, options?: {
			signal?: AbortSignal;
		}) => Promise<{
			id: ProductId<"job">;
			status: "completed" | "failed" | "processing" | "waiting_for_upload" | "validating" | "completed_with_warnings" | "rejected";
			document_id: ProductId<"document"> | null;
			external_id: string | null;
			external_group_id: string | null;
			progress: {
				pages_total: number;
				pages_completed: number;
			} | null;
			result_available: boolean;
			detail: {
				code: string;
				message: string;
				stage?: "upload" | "planning" | "validation" | "scan" | "extraction" | "finalization" | undefined;
				required_pages?: number | undefined;
			} | null;
			created_at: string;
			updated_at: string;
			completed_at: string | null;
			classification?: {
				id: ProductId<"classification">;
				status: "completed" | "failed" | "pending" | "processing";
			} | undefined;
		}>;
		/** Collects available content by Job ID, or one requested Page window, without waiting. */
		result: (jobId: string, options?: ResultOptions) => Promise<{
			job: {
				id: ProductId<"job">;
				status: "completed" | "failed" | "completed_with_warnings";
			};
			document: {
				id: ProductId<"document">;
				filename: string;
				media_type: string;
				page_count: number;
				content_status: "available" | "partially_available" | "unavailable";
				confidence_score: number;
			};
			pages: {
				page_number: number;
				markdown: string | null;
				confidence_score: number;
				warnings: {
					message: string;
					code: "page_extraction_failed";
				}[];
			}[];
			warnings: {
				code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large" | "page_extraction_failed";
				message: string;
			}[];
			classification?: {
				id: ProductId<"classification">;
				status: "completed" | "failed" | "pending" | "processing";
				document_id: ProductId<"document"> | null;
				schema: {
					category: string;
					criteria: string[];
				}[];
				categories: string[] | null;
				evaluated_pages: number[];
				detail: {
					code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large";
					message: string;
				} | null;
				created_at: string;
				updated_at: string;
				completed_at: string | null;
			} | undefined;
		}>;
	};
	readonly classifications: {
		/** Requests classification of retained content and returns without waiting. */
		create: (input: ClassificationCreateInput) => Promise<{
			id: ProductId<"classification">;
			status: "completed" | "failed" | "pending" | "processing";
		}>;
		/** Reads one classification's status and result by its original identity. */
		get: (documentId: string, classificationId: string, options?: {
			signal?: AbortSignal;
		}) => Promise<{
			id: ProductId<"classification">;
			status: "completed" | "failed" | "pending" | "processing";
			document_id: ProductId<"document"> | null;
			schema: {
				category: string;
				criteria: string[];
			}[];
			categories: string[] | null;
			evaluated_pages: number[];
			detail: {
				code: "classification_failed" | "classification_content_unavailable" | "classification_input_too_large";
				message: string;
			} | null;
			created_at: string;
			updated_at: string;
			completed_at: string | null;
		}>;
	};
	/** Creates a Product API client for a named deployment environment. */
	constructor(options?: PageletOptions);
}

export {};
