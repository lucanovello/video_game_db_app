import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createdResponse, errorResponse, readRequestFields, resolveRedirectPath } from "@/lib/route";
import { gameExists } from "@/lib/games";
import { getOrCreateUserByHandle } from "@/lib/users";
import {
  cleanOptionalText,
  INVALID_HANDLE_MESSAGE,
  isValidHandle,
  isValidQid,
  normalizeHandle,
  parseOptionalInt,
} from "@/lib/validation";

export async function POST(request: NextRequest) {
  const fields = await readRequestFields(request);
  const handle = normalizeHandle(fields.handle ?? "");
  const gameQid = (fields.gameQid ?? "").trim();
  const redirectTo = resolveRedirectPath(fields.redirectTo, `/games/${gameQid}`);

  if (!isValidHandle(handle)) {
    return errorResponse(request, INVALID_HANDLE_MESSAGE, 400);
  }

  if (!isValidQid(gameQid)) {
    return errorResponse(request, "Invalid game QID", 400);
  }

  if (!(await gameExists(gameQid))) {
    return errorResponse(request, "Game not found", 404);
  }

  const rating = parseOptionalInt(fields.rating?.trim() ?? null, 1, 10);
  if (fields.rating && rating === null) {
    return errorResponse(request, "Rating must be an integer from 1 to 10", 400);
  }

  const body = cleanOptionalText(fields.body);
  if (body && body.length > 5000) {
    return errorResponse(request, "Review body must be 5000 characters or less", 400);
  }

  if (rating === null && !body) {
    return errorResponse(request, "Provide a rating or review text", 400);
  }

  const user = await getOrCreateUserByHandle(handle);
  const review = await prisma.review.upsert({
    where: {
      userId_gameQid: {
        userId: user.id,
        gameQid,
      },
    },
    create: {
      userId: user.id,
      gameQid,
      rating,
      body,
    },
    update: {
      rating,
      body,
    },
    select: { id: true },
  });

  return createdResponse(request, { id: review.id, gameQid, handle }, redirectTo);
}
