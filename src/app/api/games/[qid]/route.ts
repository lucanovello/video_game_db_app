import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ qid: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { qid } = await context.params;

  const game = await prisma.game.findUnique({
    where: { qid },
    select: {
      qid: true,
      title: true,
      description: true,
      imageUrl: true,
      imageCommons: true,
      releaseYear: true,
      platforms: {
        select: {
          platform: {
            select: { qid: true, name: true },
          },
        },
      },
      tags: {
        select: {
          tag: {
            select: { id: true, label: true, kind: true },
          },
        },
      },
      companies: {
        select: {
          role: true,
          company: {
            select: { qid: true, name: true },
          },
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          rating: true,
          body: true,
          createdAt: true,
          user: { select: { handle: true } },
        },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json(game);
}
