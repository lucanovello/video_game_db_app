import { prisma } from "../lib/prisma";

import type { Prisma } from "@prisma/client";

type JunkReason = "missing_label" | "missing_claims" | "missing_entity";

type GameRow = {
  qid: string;
  title: string;
  lastEnrichedAt: Date | null;
  claimsJson: Prisma.JsonValue | null;
  isJunk: boolean;
};

function isQidTitle(value: string) {
  return /^Q\d+$/.test(value.trim());
}

async function main() {
  let cursorQid: string | null = null;
  let scanned = 0;
  let junked = 0;

  for (;;) {
    const games: GameRow[] = await prisma.game.findMany({
      where: cursorQid ? { qid: { gt: cursorQid } } : {},
      orderBy: { qid: "asc" },
      take: 500,
      select: {
        qid: true,
        title: true,
        lastEnrichedAt: true,
        claimsJson: true,
        isJunk: true,
      },
    });

    if (!games.length) break;

    const updates: { qid: string; reason: JunkReason }[] = [];

    for (const game of games) {
      scanned += 1;
      cursorQid = game.qid;

      if (game.isJunk) continue;

      if (game.lastEnrichedAt === null) {
        updates.push({ qid: game.qid, reason: "missing_claims" });
        continue;
      }

      // When wbgetentities returns "missing", enrich stores JsonNull (which reads back as null).
      if (game.claimsJson === null) {
        updates.push({ qid: game.qid, reason: "missing_entity" });
        continue;
      }

      if (isQidTitle(game.title)) {
        updates.push({ qid: game.qid, reason: "missing_label" });
      }
    }

    if (updates.length) {
      await prisma.$transaction(
        updates.map((update) =>
          prisma.game.update({
            where: { qid: update.qid },
            data: {
              isJunk: true,
              junkReason: update.reason,
            },
          }),
        ),
      );
      junked += updates.length;
    }

    console.log(
      `flagJunkGames: scanned=${scanned} junked=${junked} cursor=${cursorQid}`,
    );
  }

  const summary = await prisma.game.groupBy({
    by: ["junkReason"],
    where: { isJunk: true },
    _count: { _all: true },
    orderBy: { junkReason: "asc" },
  });

  console.log(
    "flagJunkGames: junkByReason",
    summary.map((row) => ({
      junkReason: row.junkReason ?? "(null)",
      count: row._count._all,
    })),
  );
}

main()
  .catch((error: unknown) => {
    const code =
      typeof error === "object" && error && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P1001") {
      console.error(
        "Database not reachable. Is Postgres running and DATABASE_URL correct?",
      );
      process.exit(1);
    }

    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
