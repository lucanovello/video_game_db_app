import type { WikidataClaim, WikidataClaims } from "../lib/types";

function getClaimValue(claim: WikidataClaim): unknown | null {
  if (claim.mainsnak?.snaktype !== "value") return null;
  return claim.mainsnak.datavalue?.value ?? null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPropertyClaims(
  claims: WikidataClaims | undefined,
  propertyId: string,
): WikidataClaim[] {
  return claims?.[propertyId] ?? [];
}

function parseWikidataYear(timeValue: string): number | null {
  const match = timeValue.match(/^([+-]?\d{1,6})/);
  if (!match) return null;

  const year = Number(match[1]);
  if (!Number.isInteger(year)) return null;
  return year > 0 ? year : null;
}

function normalizeClaimId(claim: WikidataClaim): string | null {
  const id = claim.id?.trim();
  return id ? id : null;
}

function normalizeStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseWikidataDateParts(timeValue: string): {
  year: number | null;
  month: number | null;
  day: number | null;
} {
  const match = timeValue.match(/^([+-]?\d{1,6})-(\d{2})-(\d{2})T/);
  if (!match) {
    return { year: parseWikidataYear(timeValue), month: null, day: null };
  }

  const year = parseWikidataYear(match[1] ?? "");
  if (year === null) return { year: null, month: null, day: null };

  const monthRaw = Number.parseInt(match[2] ?? "", 10);
  const dayRaw = Number.parseInt(match[3] ?? "", 10);

  const month =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : null;
  const day =
    Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : null;

  return { year, month, day };
}

interface ExtractedStringClaim {
  claimId: string | null;
  value: string;
}

interface ExtractedWikidataTimeClaim {
  claimId: string | null;
  rank: "preferred" | "normal" | "deprecated" | null;
  time: string;
  precision: number | null;
  year: number | null;
  month: number | null;
  day: number | null;
  platformQid: string | null;
  regionQid: string | null;
  claimJson: Record<string, unknown> | null;
}

function extractQualifierItemId(
  claim: WikidataClaim,
  propertyIds: string[],
): string | null {
  const qualifiers = claim.qualifiers;
  if (!isObject(qualifiers)) return null;

  for (const propertyId of propertyIds) {
    const qualifierList = qualifiers[propertyId];
    if (!Array.isArray(qualifierList)) continue;

    for (const qualifierClaim of qualifierList) {
      const raw = getClaimValue(qualifierClaim as WikidataClaim);
      if (!isObject(raw)) continue;
      const id = raw["id"];
      if (typeof id === "string" && id.startsWith("Q")) {
        return id;
      }
    }
  }

  return null;
}

interface ExtractedQuantityClaim {
  claimId: string | null;
  amount: number;
  unit: string | null;
}

export function extractEntityIds(
  claims: WikidataClaims | undefined,
  propertyId: string,
): string[] {
  const out = new Set<string>();

  for (const claim of getPropertyClaims(claims, propertyId)) {
    const raw = getClaimValue(claim);
    if (!isObject(raw)) continue;

    const id = raw["id"];
    if (typeof id === "string" && id.startsWith("Q")) {
      out.add(id);
    }
  }

  return [...out];
}

export function extractImageCommons(
  claims: WikidataClaims | undefined,
): string | null {
  for (const claim of getPropertyClaims(claims, "P18")) {
    const raw = getClaimValue(claim);
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }

  return null;
}

export function extractImageCommonsFiles(
  claims: WikidataClaims | undefined,
): string[] {
  const out = new Set<string>();

  for (const claim of getPropertyClaims(claims, "P18")) {
    const value = normalizeStringValue(getClaimValue(claim));
    if (!value) continue;
    out.add(value);
  }

  return [...out];
}

export function extractStringClaims(
  claims: WikidataClaims | undefined,
  propertyId: string,
): ExtractedStringClaim[] {
  const out = new Map<string, ExtractedStringClaim>();

  for (const claim of getPropertyClaims(claims, propertyId)) {
    const value = normalizeStringValue(getClaimValue(claim));
    if (!value) continue;

    const key = value.toLowerCase();
    if (!out.has(key)) {
      out.set(key, { claimId: normalizeClaimId(claim), value });
    }
  }

  return [...out.values()];
}

export function extractReleaseDateClaims(
  claims: WikidataClaims | undefined,
): ExtractedWikidataTimeClaim[] {
  const out = new Map<string, ExtractedWikidataTimeClaim>();

  for (const claim of getPropertyClaims(claims, "P577")) {
    const raw = getClaimValue(claim);
    if (!isObject(raw)) continue;

    const timeValue = raw["time"];
    if (typeof timeValue !== "string" || !timeValue.trim()) continue;

    const precisionRaw = raw["precision"];
    const precision =
      typeof precisionRaw === "number" && Number.isFinite(precisionRaw)
        ? precisionRaw
        : null;

    const { year, month, day } = parseWikidataDateParts(timeValue);
    if (year === null) continue;

    const claimId = normalizeClaimId(claim);
    const key = claimId ?? timeValue;

    out.set(key, {
      claimId,
      rank:
        claim.rank === "preferred" ||
        claim.rank === "normal" ||
        claim.rank === "deprecated"
          ? claim.rank
          : null,
      time: timeValue.trim(),
      precision,
      year,
      month,
      day,
      platformQid: extractQualifierItemId(claim, ["P400"]),
      regionQid: extractQualifierItemId(claim, ["P291", "P3005"]),
      claimJson: isObject(claim) ? { ...claim } : null,
    });
  }

  return [...out.values()];
}

export function extractReleaseYear(
  claims: WikidataClaims | undefined,
): number | null {
  const years = extractReleaseDateClaims(claims)
    .map((item) => item.year)
    .filter((value): value is number => value !== null);

  if (!years.length) return null;
  return Math.min(...years);
}

export function extractQuantityClaims(
  claims: WikidataClaims | undefined,
  propertyId: string,
): ExtractedQuantityClaim[] {
  const out = new Map<string, ExtractedQuantityClaim>();

  for (const claim of getPropertyClaims(claims, propertyId)) {
    const raw = getClaimValue(claim);
    if (!isObject(raw)) continue;

    const amountRaw = raw["amount"];
    if (typeof amountRaw !== "string") continue;

    const amount = Number.parseFloat(amountRaw);
    if (!Number.isFinite(amount)) continue;

    const unitRaw = raw["unit"];
    const unit = typeof unitRaw === "string" && unitRaw.trim() ? unitRaw : null;

    const claimId = normalizeClaimId(claim);
    const key = claimId ?? `${propertyId}:${amount}:${unit ?? ""}`;

    out.set(key, {
      claimId,
      amount,
      unit,
    });
  }

  return [...out.values()];
}
