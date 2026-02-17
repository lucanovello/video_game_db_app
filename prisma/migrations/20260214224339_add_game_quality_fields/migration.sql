-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "isJunk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "junkReason" TEXT,
ADD COLUMN     "sitelinks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wikiTitleEn" TEXT,
ADD COLUMN     "wikiUrlEn" TEXT;

-- CreateIndex
CREATE INDEX "Game_isJunk_idx" ON "Game"("isJunk");

-- CreateIndex
CREATE INDEX "Game_isJunk_releaseYear_idx" ON "Game"("isJunk", "releaseYear");
