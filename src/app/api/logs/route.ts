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
  parseOptionalDate,
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

  const playedOnRaw = fields.playedOn ? fields.playedOn.trim() : null;
  const playedOn = parseOptionalDate(playedOnRaw);
  if (playedOnRaw && !playedOn) {
    return errorResponse(request, "Invalid playedOn date", 400);
  }

  const notes = cleanOptionalText(fields.notes);
  if (notes && notes.length > 2000) {
    return errorResponse(request, "Notes must be 2000 characters or less", 400);
  }

  const user = await getOrCreateUserByHandle(handle);
  const log = await prisma.gameLog.create({
    data: {
      userId: user.id,
      gameQid,
      playedOn,
      notes,
    },
    select: { id: true },
  });

  return createdResponse(request, { id: log.id, gameQid, handle }, redirectTo);
}
