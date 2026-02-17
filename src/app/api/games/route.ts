import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 24;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim() ?? "";
  const platform = searchParams.get("platform")?.trim() ?? "";
  const yearRaw = searchParams.get("year")?.trim() ?? "";
  const pageRaw = searchParams.get("page")?.trim() ?? "1";
  const includeJunk = (searchParams.get("includeJunk")?.trim() ?? "") === "1";

  const year = Number.parseInt(yearRaw, 10);
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.GameWhereInput = {};
  const and: Prisma.GameWhereInput[] = [];

  if (!includeJunk) {
    and.push({ isJunk: false });
  }
  if (q) {
    and.push({ title: { contains: q, mode: "insensitive" } });
  }
  if (platform) {
    and.push({ platforms: { some: { platformQid: platform } } });
  }
  if (Number.isFinite(year)) {
    and.push({ releaseYear: year });
  }
  if (and.length) {
    where.AND = and;
  }

  const [total, games] = await prisma.$transaction([
    prisma.game.count({ where }),
    prisma.game.findMany({
      where,
      orderBy: [{ releaseYear: "desc" }, { title: "asc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        qid: true,
        title: true,
        description: true,
        releaseYear: true,
        imageUrl: true,
        platforms: {
          select: {
            platform: {
              select: { qid: true, name: true },
            },
          },
          take: 3,
        },
      },
    }),
  ]);

  return NextResponse.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    items: games,
  });
}
