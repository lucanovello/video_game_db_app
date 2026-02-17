-- CreateEnum
CREATE TYPE "GameCategory" AS ENUM ('MAIN_GAME', 'DLC_ADDON', 'EXPANSION', 'BUNDLE', 'STANDALONE_EXPANSION', 'MOD', 'EPISODE', 'SEASON', 'REMAKE', 'REMASTER', 'EXPANDED_GAME', 'PORT', 'FORK', 'PACK', 'UPDATE');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('RELEASED', 'ALPHA', 'BETA', 'EARLY_ACCESS', 'OFFLINE', 'CANCELLED', 'RUMORED', 'DELISTED');

-- CreateEnum
CREATE TYPE "ReleaseDateCategory" AS ENUM ('YYYYMMMMDD', 'YYYYMMMM', 'YYYY', 'YYYYQ1', 'YYYYQ2', 'YYYYQ3', 'YYYYQ4', 'TBD');

-- CreateEnum
CREATE TYPE "WebsiteCategory" AS ENUM ('OFFICIAL', 'WIKIPEDIA', 'STEAM', 'GOG', 'EPIC_GAMES', 'ITCH', 'APPLE', 'ANDROID', 'TWITCH', 'YOUTUBE', 'DISCORD', 'REDDIT', 'FACEBOOK', 'INSTAGRAM', 'TWITTER', 'OTHER');

-- CreateEnum
CREATE TYPE "ExternalGameCategory" AS ENUM ('STEAM', 'GOG', 'EPIC_GAME_STORE', 'ITCH_IO', 'MICROSOFT_STORE', 'PLAYSTATION_STORE', 'NINTENDO_ESTORE', 'APPLE', 'ANDROID', 'TWITCH', 'YOUTUBE', 'DISCORD', 'METACRITIC', 'OTHER');

-- CreateEnum
CREATE TYPE "GameImageKind" AS ENUM ('COVER', 'ARTWORK', 'SCREENSHOT', 'OTHER');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('YOUTUBE', 'VIMEO', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompanyRole" ADD VALUE 'PORTING';
ALTER TYPE "CompanyRole" ADD VALUE 'SUPPORTING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TagKind" ADD VALUE 'THEME';
ALTER TYPE "TagKind" ADD VALUE 'KEYWORD';
ALTER TYPE "TagKind" ADD VALUE 'PLAYER_PERSPECTIVE';
ALTER TYPE "TagKind" ADD VALUE 'FRANCHISE';

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "category" "GameCategory",
ADD COLUMN     "firstReleaseAt" TIMESTAMP(3),
ADD COLUMN     "status" "GameStatus",
ADD COLUMN     "storyline" TEXT;

-- CreateTable
CREATE TABLE "ReleaseDate" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "platformQid" TEXT,
    "regionQid" TEXT,
    "category" "ReleaseDateCategory",
    "date" TIMESTAMP(3),
    "year" INTEGER,
    "month" INTEGER,
    "day" INTEGER,
    "precision" INTEGER,
    "human" TEXT,
    "source" TEXT,
    "claimId" TEXT,
    "claimJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "category" "WebsiteCategory" NOT NULL DEFAULT 'OTHER',
    "url" TEXT NOT NULL,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalGame" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "category" "ExternalGameCategory" NOT NULL DEFAULT 'OTHER',
    "uid" TEXT,
    "name" TEXT,
    "url" TEXT,
    "source" TEXT,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlternativeName" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "comment" TEXT,
    "source" TEXT,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlternativeName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameImage" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "kind" "GameImageKind" NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "imageId" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "isAnimated" BOOLEAN NOT NULL DEFAULT false,
    "hasAlpha" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameVideo" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "provider" "VideoProvider" NOT NULL DEFAULT 'YOUTUBE',
    "videoId" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReleaseDate_gameQid_date_idx" ON "ReleaseDate"("gameQid", "date");

-- CreateIndex
CREATE INDEX "ReleaseDate_gameQid_year_idx" ON "ReleaseDate"("gameQid", "year");

-- CreateIndex
CREATE INDEX "ReleaseDate_platformQid_idx" ON "ReleaseDate"("platformQid");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseDate_gameQid_claimId_key" ON "ReleaseDate"("gameQid", "claimId");

-- CreateIndex
CREATE INDEX "Website_gameQid_category_idx" ON "Website"("gameQid", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Website_gameQid_url_key" ON "Website"("gameQid", "url");

-- CreateIndex
CREATE INDEX "ExternalGame_category_uid_idx" ON "ExternalGame"("category", "uid");

-- CreateIndex
CREATE INDEX "ExternalGame_gameQid_idx" ON "ExternalGame"("gameQid");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalGame_gameQid_category_uid_key" ON "ExternalGame"("gameQid", "category", "uid");

-- CreateIndex
CREATE INDEX "AlternativeName_gameQid_idx" ON "AlternativeName"("gameQid");

-- CreateIndex
CREATE UNIQUE INDEX "AlternativeName_gameQid_name_key" ON "AlternativeName"("gameQid", "name");

-- CreateIndex
CREATE INDEX "GameImage_gameQid_kind_idx" ON "GameImage"("gameQid", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "GameImage_gameQid_kind_url_key" ON "GameImage"("gameQid", "kind", "url");

-- CreateIndex
CREATE INDEX "GameVideo_provider_videoId_idx" ON "GameVideo"("provider", "videoId");

-- CreateIndex
CREATE INDEX "GameVideo_gameQid_idx" ON "GameVideo"("gameQid");

-- CreateIndex
CREATE UNIQUE INDEX "GameVideo_gameQid_provider_videoId_key" ON "GameVideo"("gameQid", "provider", "videoId");

-- CreateIndex
CREATE INDEX "Game_firstReleaseAt_idx" ON "Game"("firstReleaseAt");

-- AddForeignKey
ALTER TABLE "ReleaseDate" ADD CONSTRAINT "ReleaseDate_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseDate" ADD CONSTRAINT "ReleaseDate_platformQid_fkey" FOREIGN KEY ("platformQid") REFERENCES "Platform"("qid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalGame" ADD CONSTRAINT "ExternalGame_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativeName" ADD CONSTRAINT "AlternativeName_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameImage" ADD CONSTRAINT "GameImage_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;
