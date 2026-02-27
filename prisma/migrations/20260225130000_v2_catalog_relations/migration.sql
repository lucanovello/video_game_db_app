CREATE TYPE "StatementRank" AS ENUM ('PREFERRED', 'NORMAL', 'DEPRECATED');
CREATE TYPE "GameRelationKind" AS ENUM ('PART_OF_SERIES', 'FOLLOWS', 'FOLLOWED_BY');

ALTER TABLE "Game"
	DROP COLUMN "aggregatedRating",
	DROP COLUMN "aggregatedRatingCount",
	DROP COLUMN "rating",
	DROP COLUMN "ratingCount",
	DROP COLUMN "totalRating",
	DROP COLUMN "totalRatingCount";

ALTER TABLE "ReleaseDate"
	ADD COLUMN "rank" "StatementRank",
	ADD COLUMN "calendarModel" TEXT;

CREATE TABLE "Controller" (
	"qid" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"description" TEXT,
	"source" TEXT,
	"claimJson" JSONB,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "Controller_pkey" PRIMARY KEY ("qid")
);

CREATE TABLE "PlatformController" (
	"platformQid" TEXT NOT NULL,
	"controllerQid" TEXT NOT NULL,
	"source" TEXT,
	"claimId" TEXT,
	"claimJson" JSONB,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "PlatformController_pkey" PRIMARY KEY ("platformQid", "controllerQid")
);

CREATE TABLE "PlatformFamily" (
	"qid" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"description" TEXT,
	"source" TEXT,
	"claimJson" JSONB,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "PlatformFamily_pkey" PRIMARY KEY ("qid")
);

CREATE TABLE "PlatformFamilyMember" (
	"platformQid" TEXT NOT NULL,
	"familyQid" TEXT NOT NULL,
	"generation" INTEGER,
	"source" TEXT,
	"claimId" TEXT,
	"claimJson" JSONB,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "PlatformFamilyMember_pkey" PRIMARY KEY ("platformQid", "familyQid")
);

CREATE TABLE "GameRelation" (
	"id" TEXT NOT NULL,
	"fromGameQid" TEXT NOT NULL,
	"toGameQid" TEXT NOT NULL,
	"kind" "GameRelationKind" NOT NULL,
	"source" TEXT,
	"claimId" TEXT,
	"claimJson" JSONB,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "GameRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameRelation_fromGameQid_toGameQid_kind_key" ON "GameRelation"("fromGameQid", "toGameQid", "kind");

CREATE INDEX "ReleaseDate_rank_idx" ON "ReleaseDate"("rank");
CREATE INDEX "ReleaseDate_gameQid_platformQid_regionQid_date_idx" ON "ReleaseDate"("gameQid", "platformQid", "regionQid", "date");
CREATE INDEX "Controller_name_idx" ON "Controller"("name");
CREATE INDEX "PlatformController_controllerQid_idx" ON "PlatformController"("controllerQid");
CREATE INDEX "PlatformFamily_name_idx" ON "PlatformFamily"("name");
CREATE INDEX "PlatformFamilyMember_familyQid_idx" ON "PlatformFamilyMember"("familyQid");
CREATE INDEX "GameRelation_toGameQid_kind_idx" ON "GameRelation"("toGameQid", "kind");
CREATE INDEX "GameRelation_fromGameQid_kind_idx" ON "GameRelation"("fromGameQid", "kind");

ALTER TABLE "PlatformController"
	ADD CONSTRAINT "PlatformController_platformQid_fkey" FOREIGN KEY ("platformQid") REFERENCES "Platform"("qid") ON DELETE CASCADE ON UPDATE CASCADE,
	ADD CONSTRAINT "PlatformController_controllerQid_fkey" FOREIGN KEY ("controllerQid") REFERENCES "Controller"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformFamilyMember"
	ADD CONSTRAINT "PlatformFamilyMember_platformQid_fkey" FOREIGN KEY ("platformQid") REFERENCES "Platform"("qid") ON DELETE CASCADE ON UPDATE CASCADE,
	ADD CONSTRAINT "PlatformFamilyMember_familyQid_fkey" FOREIGN KEY ("familyQid") REFERENCES "PlatformFamily"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameRelation"
	ADD CONSTRAINT "GameRelation_fromGameQid_fkey" FOREIGN KEY ("fromGameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE,
	ADD CONSTRAINT "GameRelation_toGameQid_fkey" FOREIGN KEY ("toGameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;
