function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function commonsFileUrl(filename: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

export function getPlatformImageUrlFromClaims(claimsJson: unknown): string | null {
  if (!isRecord(claimsJson)) return null;

  const claims = claimsJson["P18"];
  if (!Array.isArray(claims)) return null;

  for (const claim of claims) {
    if (!isRecord(claim)) continue;
    const mainsnak = claim["mainsnak"];
    if (!isRecord(mainsnak)) continue;
    const datavalue = mainsnak["datavalue"];
    if (!isRecord(datavalue)) continue;
    const value = datavalue["value"];
    if (typeof value === "string" && value.trim()) {
      return commonsFileUrl(value.trim());
    }
  }

  return null;
}