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
        include: {
          platform: {
            select: {
              qid: true,
              name: true,
              slug: true,
              controllers: {
                select: {
                  controller: {
                    select: { qid: true, name: true },
                  },
                },
              },
            },
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
      releaseDates: {
        orderBy: [{ date: "asc" }, { year: "asc" }],
        include: {
          platform: { select: { qid: true, name: true, slug: true } },
        },
      },
      websites: {
        orderBy: { category: "asc" },
      },
      externalGames: {
        orderBy: { category: "asc" },
      },
      scores: {
        orderBy: [{ provider: "asc" }],
      },
      outgoingRelations: {
        orderBy: { kind: "asc" },
        include: {
          toGame: { select: { qid: true, title: true, releaseYear: true } },
        },
      },
      incomingRelations: {
        orderBy: { kind: "asc" },
        include: {
          fromGame: { select: { qid: true, title: true, releaseYear: true } },
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
