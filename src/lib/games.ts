import { prisma } from "@/lib/prisma";

export async function gameExists(gameQid: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { qid: gameQid },
    select: { qid: true },
  });

  return Boolean(game);
}
