import { ScoreProvider } from "@prisma/client";
import { prisma } from "./lib/prisma";

async function main() {
  const aggregates = await prisma.review.groupBy({
    by: ["gameQid"],
    where: { rating: { not: null } },
    _count: { rating: true },
    _avg: { rating: true },
  });

  const ratingByGame = new Map(
    aggregates.map(
      (row) =>
        [
          row.gameQid,
          {
            avg: row._avg.rating ?? null,
            count: row._count.rating,
          },
        ] as const,
    ),
  );

  let updated = 0;
  const games = await prisma.game.findMany({ select: { qid: true } });

  for (const game of games) {
    const stats = ratingByGame.get(game.qid);
    const rating =
      stats?.avg !== null && stats?.avg !== undefined
        ? Number(stats.avg.toFixed(2))
        : null;
    const ratingCount = stats?.count ?? 0;

    await prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { qid: game.qid },
        data: {
          rating,
          ratingCount: ratingCount || null,
          totalRating: rating,
          totalRatingCount: ratingCount || null,
        },
      });

      if (rating === null) {
        await tx.gameScore.deleteMany({
          where: { gameQid: game.qid, provider: ScoreProvider.INTERNAL },
        });
      } else {
        await tx.gameScore.upsert({
          where: {
            gameQid_provider: {
              gameQid: game.qid,
              provider: ScoreProvider.INTERNAL,
            },
          },
          create: {
            gameQid: game.qid,
            provider: ScoreProvider.INTERNAL,
            score: rating,
            count: ratingCount,
            source: "internal:reviews",
          },
          update: {
            score: rating,
            count: ratingCount,
            source: "internal:reviews",
            asOf: new Date(),
          },
        });
      }
    });

    updated += 1;
  }

  console.log(
    `backfillGameScores: games=${games.length} updated=${updated} ratedGames=${aggregates.length}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
