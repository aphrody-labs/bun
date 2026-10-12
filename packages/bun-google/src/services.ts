// SPDX-License-Identifier: Apache-2.0
import { createClient, type GoogleClientOptions } from "bun:google";

export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
  [field: string]: unknown;
}

export interface DrivePage {
  files?: DriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

export interface GoogleDocument {
  documentId?: string;
  title?: string;
  revisionId?: string;
  [field: string]: unknown;
}

export interface ServiceOptions {
  credentialProvider: GoogleClientOptions["credentialProvider"];
  fetch?: GoogleClientOptions["fetch"];
  endpoints?: { drive?: string; docs?: string; gemini?: string };
}

function id(value: string): string {
  if (typeof value !== "string" || !value || value === "." || value === "..")
    throw new TypeError("Google resource ID must be non-empty");
  return encodeURIComponent(value);
}

function query(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, String(value));
  return params.size ? `?${params}` : "";
}

function record(value: unknown, resource: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Google ${resource} response is invalid`);
  return value as Record<string, unknown>;
}

function driveFile(value: unknown): DriveFile {
  const file = record(value, "Drive file");
  for (const field of ["id", "name", "mimeType", "modifiedTime", "md5Checksum", "size"])
    if (file[field] !== undefined && file[field] !== null && typeof file[field] !== "string")
      throw new Error("Google Drive file response is invalid");
  return file as DriveFile;
}

async function drivePage(response: Response): Promise<DrivePage> {
  const page = record(await response.json(), "Drive list");
  if (page.files !== undefined && !Array.isArray(page.files)) throw new Error("Google Drive list response is invalid");
  if (page.nextPageToken !== undefined && typeof page.nextPageToken !== "string")
    throw new Error("Google Drive list response is invalid");
  if (page.incompleteSearch !== undefined && typeof page.incompleteSearch !== "boolean")
    throw new Error("Google Drive list response is invalid");
  return {
    files: page.files?.map(driveFile),
    nextPageToken: page.nextPageToken as string | undefined,
    incompleteSearch: page.incompleteSearch as boolean | undefined,
  };
}

async function googleDocument(response: Response): Promise<GoogleDocument> {
  const document = record(await response.json(), "Docs document");
  for (const field of ["documentId", "title", "revisionId"])
    if (document[field] !== undefined && document[field] !== null && typeof document[field] !== "string")
      throw new Error("Google Docs document response is invalid");
  return document as GoogleDocument;
}

export function createGoogleServices(options: ServiceOptions) {
  const shared = { credentialProvider: options.credentialProvider, fetch: options.fetch };
  const drive = createClient({
    ...shared,
    baseURL: options.endpoints?.drive ?? "https://www.googleapis.com/drive/v3/",
  });
  const docs = createClient({
    ...shared,
    baseURL: options.endpoints?.docs ?? "https://docs.googleapis.com/v1/",
  });
  const gemini = createClient({
    ...shared,
    baseURL: options.endpoints?.gemini ?? "https://generativelanguage.googleapis.com/v1beta/",
  });
  return {
    drive: {
      async listFiles(
        params: {
          q?: string;
          fields?: string;
          pageSize?: number;
          pageToken?: string;
          supportsAllDrives?: boolean;
          includeItemsFromAllDrives?: boolean;
        } = {},
        signal?: AbortSignal,
      ): Promise<DrivePage> {
        if (
          params.pageSize !== undefined &&
          (!Number.isInteger(params.pageSize) || params.pageSize < 1 || params.pageSize > 1000)
        )
          throw new RangeError("Drive pageSize must be an integer from 1 through 1000");
        const response = await drive.request(`files${query(params)}`, { signal });
        return drivePage(response);
      },
      async getFile(fileId: string, fields?: string, signal?: AbortSignal): Promise<DriveFile> {
        return driveFile(await (await drive.request(`files/${id(fileId)}${query({ fields })}`, { signal })).json());
      },
      async exportFile(fileId: string, mimeType: string, signal?: AbortSignal): Promise<Response> {
        if (!mimeType) throw new TypeError("Drive export requires a MIME type");
        return drive.request(`files/${id(fileId)}/export${query({ mimeType })}`, { signal });
      },
      async *files(
        params: { q?: string; fields?: string; pageSize?: number } = {},
        options: { maxPages?: number; signal?: AbortSignal } = {},
      ): AsyncGenerator<DriveFile> {
        const maxPages = options.maxPages ?? 100;
        if (!Number.isSafeInteger(maxPages) || maxPages < 1)
          throw new RangeError("Drive maxPages must be a positive integer");
        if (params.fields && !params.fields.includes("nextPageToken"))
          throw new TypeError("Drive pagination fields must include nextPageToken");
        const seen = new Set<string>();
        let pageToken: string | undefined;
        for (let page = 0; page < maxPages; page++) {
          const result = await this.listFiles({ ...params, pageToken }, options.signal);
          for (const file of result.files ?? []) yield file;
          if (!result.nextPageToken) return;
          if (seen.has(result.nextPageToken)) throw new Error("Drive returned a repeated page token");
          seen.add(result.nextPageToken);
          pageToken = result.nextPageToken;
        }
        throw new Error("Drive pagination exceeded maxPages");
      },
    },
    docs: {
      async get(documentId: string, signal?: AbortSignal): Promise<GoogleDocument> {
        return googleDocument(await docs.request(`documents/${id(documentId)}`, { signal }));
      },
      async batchUpdate(
        documentId: string,
        requests: readonly Record<string, unknown>[],
        requiredRevisionId: string,
        signal?: AbortSignal,
      ): Promise<unknown> {
        if (!requiredRevisionId?.trim()) throw new TypeError("Docs batchUpdate requires the reviewed revision ID");
        return (
          await docs.request(`documents/${id(documentId)}:batchUpdate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ requests, writeControl: { requiredRevisionId } }),
            signal,
          })
        ).json();
      },
    },
    gemini: {
      async generate(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
        return (
          await gemini.request(`models/${id(model)}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal,
          })
        ).json();
      },
      /** Returns the SSE response; the caller owns reading and cancelling its body. */
      stream(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
        return gemini.request(`models/${id(model)}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
      },
    },
  };
}
