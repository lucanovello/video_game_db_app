export type WdqsBindingValue = {
  type: string;
  value: string;
  ["xml:lang"]?: string;
};

export type WdqsBinding = Record<string, WdqsBindingValue | undefined>;

export interface WdqsResponse {
  head?: { vars?: string[] };
  results: { bindings: WdqsBinding[] };
}

export interface WikidataMonolingualText {
  language: string;
  value: string;
}

export interface WikidataSitelink {
  site?: string;
  title?: string;
  url?: string;
}

interface WikidataDataValue {
  value: unknown;
  type?: string;
}

export interface WikidataSnak {
  snaktype?: string;
  property?: string;
  datatype?: string;
  datavalue?: WikidataDataValue;
}

export interface WikidataClaim {
  id?: string;
  mainsnak?: WikidataSnak;
  rank?: string;
}

export type WikidataClaims = Record<string, WikidataClaim[] | undefined>;

export interface WikidataEntity {
  id: string;
  type?: string;
  datatype?: string;
  labels?: Record<string, WikidataMonolingualText | undefined>;
  aliases?: Record<string, WikidataMonolingualText[] | undefined>;
  descriptions?: Record<string, WikidataMonolingualText | undefined>;
  claims?: WikidataClaims;
  sitelinks?: Record<string, WikidataSitelink | undefined>;
  missing?: string;
}

export interface WbGetEntitiesResponse {
  entities: Record<string, WikidataEntity | undefined>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseWdqsResponse(payload: unknown): WdqsResponse {
  if (!isObject(payload)) {
    throw new Error("Invalid WDQS payload: expected object");
  }

  const results = payload["results"];
  if (!isObject(results)) {
    throw new Error("Invalid WDQS payload: missing results");
  }

  const bindings = results["bindings"];
  if (!Array.isArray(bindings)) {
    throw new Error("Invalid WDQS payload: missing results.bindings");
  }

  return payload as unknown as WdqsResponse;
}

export function parseWbGetEntitiesResponse(
  payload: unknown,
): WbGetEntitiesResponse {
  if (!isObject(payload)) {
    throw new Error("Invalid wbgetentities payload: expected object");
  }

  const entities = payload["entities"];
  if (!isObject(entities)) {
    throw new Error("Invalid wbgetentities payload: missing entities");
  }

  return payload as unknown as WbGetEntitiesResponse;
}

export function getBindingString(
  binding: WdqsBinding,
  key: string,
): string | null {
  return binding[key]?.value ?? null;
}

export function getEnglishLabel(entity: WikidataEntity): string | null {
  const english = entity.labels?.en?.value?.trim();
  if (english) return english;

  const fallback = Object.values(entity.labels ?? {}).find((item) =>
    item?.value?.trim(),
  );
  return fallback?.value?.trim() ?? null;
}

export function getEnglishDescription(entity: WikidataEntity): string | null {
  const english = entity.descriptions?.en?.value?.trim();
  if (english) return english;

  const fallback = Object.values(entity.descriptions ?? {}).find((item) =>
    item?.value?.trim(),
  );
  return fallback?.value?.trim() ?? null;
}
