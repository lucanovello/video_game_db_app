import { prisma } from "@/lib/prisma";

export async function getOrCreateUserByHandle(handle: string) {
  return prisma.user.upsert({
    where: { handle },
    create: { handle },
    update: {},
  });
}
