import { fetchWithRetry } from "./http";
import { CONFIG, requireUserAgent } from "./config";
import {
  parseWbGetEntitiesResponse,
  type WbGetEntitiesResponse,
} from "./types";

async function wbGetEntities(
  ids: string[],
  props: string,
): Promise<WbGetEntitiesResponse> {
  if (!ids.length) return { entities: {} };
  requireUserAgent();

  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("languages", "en");
  url.searchParams.set("languagefallback", "1");
  url.searchParams.set("props", props);

  const res = await fetchWithRetry(
    url.toString(),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": CONFIG.userAgent,
      },
    },
    { timeoutMs: 30_000, retries: CONFIG.maxRetries },
  );

  const payload = (await res.json()) as unknown;
  return parseWbGetEntitiesResponse(payload);
}

export async function wbGetEntitiesFull(
  ids: string[],
): Promise<WbGetEntitiesResponse> {
  return wbGetEntities(ids, "labels|descriptions|claims|sitelinks");
}

export async function wbGetEntitiesLabels(
  ids: string[],
): Promise<WbGetEntitiesResponse> {
  return wbGetEntities(ids, "labels|descriptions");
}

export function commonsFileUrl(filename: string) {
  // filename like "Some_Image.jpg"
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}
