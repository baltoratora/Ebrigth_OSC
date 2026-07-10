import "server-only";

// Minimal Process Street public API client (v1.1). Auth via X-API-KEY.
// Env: PROCESS_STREET_API_KEY.
const BASE = "https://public-api.process.st/api/v1.1";

export function isProcessStreetConfigured(): boolean {
  return !!process.env.PROCESS_STREET_API_KEY;
}

function apiKey(): string {
  const k = process.env.PROCESS_STREET_API_KEY;
  if (!k) throw new Error("PROCESS_STREET_API_KEY is not set");
  return k;
}

async function ps<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "X-API-KEY": apiKey(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Process Street ${init?.method ?? "GET"} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface PsField { id: string; name: string; fieldType: string }
export interface PsDataSet { id: string; name: string; fields: PsField[] }
export interface PsCell { fieldId: string; value: string }
export interface PsRecord { id: string; cells: PsCell[] }

export async function listDataSets(): Promise<PsDataSet[]> {
  return (await ps<{ dataSets: PsDataSet[] }>("/data-sets")).dataSets ?? [];
}

export async function createDataSet(name: string, fieldNames: string[]): Promise<void> {
  // Response doesn't echo fields; callers re-fetch via listDataSets.
  await ps("/data-sets", {
    method: "POST",
    body: JSON.stringify({ name, fields: fieldNames.map((n) => ({ name: n, fieldType: "Text" })) }),
  });
}

export async function listAllRecords(dataSetId: string): Promise<PsRecord[]> {
  const out: PsRecord[] = [];
  let path: string | null = `/data-sets/${dataSetId}/records`;
  while (path) {
    const data: { records: PsRecord[]; links?: { name: string; href: string }[] } = await ps(path);
    out.push(...(data.records ?? []));
    const next = data.links?.find((l) => l.name === "next");
    path = next ? next.href : null;
  }
  return out;
}

export const createRecord = (dataSetId: string, cells: PsCell[]) =>
  ps<PsRecord>(`/data-sets/${dataSetId}/records`, { method: "POST", body: JSON.stringify({ cells }) });
export const updateRecord = (dataSetId: string, recordId: string, cells: PsCell[]) =>
  ps<PsRecord>(`/data-sets/${dataSetId}/records/${recordId}`, { method: "PUT", body: JSON.stringify({ cells }) });
export const deleteRecord = (dataSetId: string, recordId: string) =>
  ps<void>(`/data-sets/${dataSetId}/records/${recordId}`, { method: "DELETE" });
