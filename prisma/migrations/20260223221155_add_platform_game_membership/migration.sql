-- CreateTable
CREATE TABLE "PlatformGameMembership" (
    "id" TEXT NOT NULL,
    "platformQid" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "sourcePageId" TEXT NOT NULL,
    "regionHint" TEXT,
    "dateHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformGameMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformGameMembership_platformQid_idx" ON "PlatformGameMembership"("platformQid");

-- CreateIndex
CREATE INDEX "PlatformGameMembership_gameQid_idx" ON "PlatformGameMembership"("gameQid");

-- CreateIndex
CREATE INDEX "PlatformGameMembership_sourcePageId_idx" ON "PlatformGameMembership"("sourcePageId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformGameMembership_platformQid_gameQid_sourcePageId_key" ON "PlatformGameMembership"("platformQid", "gameQid", "sourcePageId");

-- AddForeignKey
ALTER TABLE "PlatformGameMembership" ADD CONSTRAINT "PlatformGameMembership_platformQid_fkey" FOREIGN KEY ("platformQid") REFERENCES "PlatformRegistry"("platformQid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformGameMembership" ADD CONSTRAINT "PlatformGameMembership_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "WikiPageCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;
