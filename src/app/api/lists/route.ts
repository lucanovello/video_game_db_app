import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createdResponse, errorResponse, readRequestFields, resolveRedirectPath } from "@/lib/route";
import { getOrCreateUserByHandle } from "@/lib/users";
import { cleanOptionalText, INVALID_HANDLE_MESSAGE, isValidHandle, normalizeHandle } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const fields = await readRequestFields(request);
  const handle = normalizeHandle(fields.handle ?? "");
  const redirectTo = resolveRedirectPath(fields.redirectTo, `/u/${handle}`);

  if (!isValidHandle(handle)) {
    return errorResponse(request, INVALID_HANDLE_MESSAGE, 400);
  }

  const name = (fields.name ?? "").trim();
  if (!name) {
    return errorResponse(request, "List name is required", 400);
  }
  if (name.length > 120) {
    return errorResponse(request, "List name must be 120 characters or less", 400);
  }

  const description = cleanOptionalText(fields.description);
  if (description && description.length > 2000) {
    return errorResponse(request, "Description must be 2000 characters or less", 400);
  }

  const isPublic = fields.isPublic !== "false";
  const user = await getOrCreateUserByHandle(handle);

  const list = await prisma.list.create({
    data: {
      userId: user.id,
      name,
      description,
      isPublic,
    },
    select: { id: true, name: true },
  });

  return createdResponse(request, { id: list.id, name: list.name, handle }, redirectTo);
}
