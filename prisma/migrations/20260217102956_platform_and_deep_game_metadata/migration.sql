-- CreateEnum
CREATE TYPE "AgeRatingOrganization" AS ENUM ('ESRB', 'PEGI', 'CERO', 'USK', 'GRAC', 'CLASS_IND', 'ACB', 'OTHER');

-- CreateEnum
CREATE TYPE "ScoreProvider" AS ENUM ('INTERNAL', 'METACRITIC', 'OPENCRITIC', 'WIKIDATA', 'OTHER');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('HOME_CONSOLE', 'HANDHELD', 'HYBRID', 'ARCADE', 'COMPUTER', 'MOBILE', 'CLOUD', 'SERVICE', 'OTHER');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "aggregatedRating" DOUBLE PRECISION,
ADD COLUMN     "aggregatedRatingCount" INTEGER,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER,
ADD COLUMN     "totalRating" DOUBLE PRECISION,
ADD COLUMN     "totalRatingCount" INTEGER;

-- AlterTable
ALTER TABLE "Platform" ADD COLUMN     "abbreviation" TEXT,
ADD COLUMN     "alternativeName" TEXT,
ADD COLUMN     "claimsJson" JSONB,
ADD COLUMN     "firstReleaseAt" TIMESTAMP(3),
ADD COLUMN     "generation" INTEGER,
ADD COLUMN     "lastEnrichedAt" TIMESTAMP(3),
ADD COLUMN     "releaseYear" INTEGER,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "type" "PlatformType",
ADD COLUMN     "url" TEXT;

-- CreateTable
CREATE TABLE "GameAgeRating" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "organization" "AgeRatingOrganization" NOT NULL DEFAULT 'OTHER',
    "rating" TEXT NOT NULL,
    "synopsis" TEXT,
    "source" TEXT,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAgeRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameScore" (
    "id" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "provider" "ScoreProvider" NOT NULL DEFAULT 'OTHER',
    "score" DOUBLE PRECISION NOT NULL,
    "count" INTEGER,
    "url" TEXT,
    "source" TEXT,
    "claimId" TEXT,
    "asOf" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameAgeRating_gameQid_organization_idx" ON "GameAgeRating"("gameQid", "organization");

-- CreateIndex
CREATE UNIQUE INDEX "GameAgeRating_gameQid_organization_rating_key" ON "GameAgeRating"("gameQid", "organization", "rating");

-- CreateIndex
CREATE INDEX "GameScore_provider_score_idx" ON "GameScore"("provider", "score");

-- CreateIndex
CREATE INDEX "GameScore_gameQid_idx" ON "GameScore"("gameQid");

-- CreateIndex
CREATE UNIQUE INDEX "GameScore_gameQid_provider_key" ON "GameScore"("gameQid", "provider");

-- CreateIndex
CREATE INDEX "Platform_type_idx" ON "Platform"("type");

-- CreateIndex
CREATE INDEX "Platform_releaseYear_idx" ON "Platform"("releaseYear");

-- AddForeignKey
ALTER TABLE "GameAgeRating" ADD CONSTRAINT "GameAgeRating_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;
