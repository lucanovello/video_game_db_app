-- AlterTable
ALTER TABLE "Platform" ADD COLUMN     "gamesCursorIri" TEXT,
ADD COLUMN     "gamesRosterDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gamesRosterFetchedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sampleGameQid" TEXT,
ADD COLUMN     "wikiProjectGameCount" INTEGER;

-- CreateIndex
CREATE INDEX "Platform_wikiProjectGameCount_idx" ON "Platform"("wikiProjectGameCount");
