import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createdResponse, errorResponse, readRequestFields, resolveRedirectPath } from "@/lib/route";
import { gameExists } from "@/lib/games";
import {
  cleanOptionalText,
  INVALID_HANDLE_MESSAGE,
  isValidHandle,
  isValidQid,
  normalizeHandle,
  parseOptionalInt,
} from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: listId } = await context.params;
  const fields = await readRequestFields(request);

  const handle = normalizeHandle(fields.handle ?? "");
  const gameQid = (fields.gameQid ?? "").trim();
  const redirectTo = resolveRedirectPath(fields.redirectTo, `/u/${handle}`);

  if (!listId) {
    return errorResponse(request, "List id is required", 400);
  }

  if (!isValidHandle(handle)) {
    return errorResponse(request, INVALID_HANDLE_MESSAGE, 400);
  }

  if (!isValidQid(gameQid)) {
    return errorResponse(request, "Invalid game QID", 400);
  }

  const [list, hasGame] = await Promise.all([
    prisma.list.findUnique({
      where: { id: listId },
      select: { id: true, user: { select: { handle: true } } },
    }),
    gameExists(gameQid),
  ]);

  if (!list) {
    return errorResponse(request, "List not found", 404);
  }
  if (!hasGame) {
    return errorResponse(request, "Game not found", 404);
  }
  if (list.user.handle !== handle) {
    return errorResponse(request, "Only the list owner can edit this list", 403);
  }

  const position = parseOptionalInt(fields.position?.trim() ?? null, 0, 100_000);
  if (fields.position && position === null) {
    return errorResponse(request, "Position must be an integer from 0 to 100000", 400);
  }

  const note = cleanOptionalText(fields.note);
  if (note && note.length > 500) {
    return errorResponse(request, "Item note must be 500 characters or less", 400);
  }

  const item = await prisma.listItem.upsert({
    where: {
      listId_gameQid: {
        listId,
        gameQid,
      },
    },
    create: {
      listId,
      gameQid,
      note,
      position: position ?? 0,
    },
    update: {
      note,
      position: position ?? 0,
    },
    select: { listId: true, gameQid: true },
  });

  return createdResponse(request, item, redirectTo);
}
