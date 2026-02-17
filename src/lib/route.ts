import { NextRequest, NextResponse } from "next/server";

type RequestFields = Record<string, string>;

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

export async function readRequestFields(
  request: NextRequest,
): Promise<RequestFields> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = (await request.json()) as unknown;
    if (!json || typeof json !== "object") return {};

    const out: RequestFields = {};
    for (const [key, value] of Object.entries(json)) {
      const asString = toStringValue(value);
      if (asString !== null) out[key] = asString;
    }

    return out;
  }

  const formData = await request.formData();
  const out: RequestFields = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }

  return out;
}

export function resolveRedirectPath(
  rawPath: string | undefined,
  fallbackPath: string,
): string {
  return rawPath && rawPath.startsWith("/") ? rawPath : fallbackPath;
}

function requestWantsJson(request: NextRequest): boolean {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  return (
    accept.includes("application/json") ||
    contentType.includes("application/json")
  );
}

export function createdResponse(
  request: NextRequest,
  payload: Record<string, unknown>,
  redirectPath: string,
): NextResponse {
  if (requestWantsJson(request)) {
    return NextResponse.json(payload, { status: 201 });
  }

  const target = new URL(redirectPath, request.url);
  return NextResponse.redirect(target, 303);
}

export function errorResponse(
  _request: NextRequest,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
