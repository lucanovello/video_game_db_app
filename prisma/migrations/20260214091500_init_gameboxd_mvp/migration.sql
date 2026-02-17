-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('GENRE', 'SERIES', 'ENGINE', 'MODE');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('DEVELOPER', 'PUBLISHER');

-- CreateTable
CREATE TABLE "Platform" (
    "qid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sitelinks" INTEGER NOT NULL DEFAULT 0,
    "isMajor" BOOLEAN NOT NULL DEFAULT false,
    "gamesCursorQid" TEXT,
    "gamesCursorUpdatedAt" TIMESTAMP(3),
    "gamesIngestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("qid")
);

-- CreateTable
CREATE TABLE "Game" (
    "qid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageCommons" TEXT,
    "imageUrl" TEXT,
    "releaseYear" INTEGER,
    "claimsJson" JSONB,
    "lastEnrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("qid")
);

-- CreateTable
CREATE TABLE "GamePlatform" (
    "gameQid" TEXT NOT NULL,
    "platformQid" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlatform_pkey" PRIMARY KEY ("gameQid","platformQid")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "kind" "TagKind" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTag" (
    "gameQid" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameTag_pkey" PRIMARY KEY ("gameQid","tagId")
);

-- CreateTable
CREATE TABLE "Company" (
    "qid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("qid")
);

-- CreateTable
CREATE TABLE "GameCompany" (
    "gameQid" TEXT NOT NULL,
    "companyQid" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameCompany_pkey" PRIMARY KEY ("gameQid","companyQid","role")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "playedOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "rating" INTEGER,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "List" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListItem" (
    "listId" TEXT NOT NULL,
    "gameQid" TEXT NOT NULL,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListItem_pkey" PRIMARY KEY ("listId","gameQid")
);

-- CreateIndex
CREATE INDEX "Platform_isMajor_idx" ON "Platform"("isMajor");

-- CreateIndex
CREATE INDEX "Platform_sitelinks_idx" ON "Platform"("sitelinks");

-- CreateIndex
CREATE INDEX "Game_releaseYear_idx" ON "Game"("releaseYear");

-- CreateIndex
CREATE INDEX "Game_updatedAt_idx" ON "Game"("updatedAt");

-- CreateIndex
CREATE INDEX "GamePlatform_platformQid_idx" ON "GamePlatform"("platformQid");

-- CreateIndex
CREATE INDEX "Tag_kind_label_idx" ON "Tag"("kind", "label");

-- CreateIndex
CREATE INDEX "GameTag_tagId_idx" ON "GameTag"("tagId");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "GameCompany_companyQid_idx" ON "GameCompany"("companyQid");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "GameLog_userId_createdAt_idx" ON "GameLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GameLog_gameQid_createdAt_idx" ON "GameLog"("gameQid", "createdAt");

-- CreateIndex
CREATE INDEX "Review_gameQid_createdAt_idx" ON "Review"("gameQid", "createdAt");

-- CreateIndex
CREATE INDEX "Review_userId_createdAt_idx" ON "Review"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_gameQid_key" ON "Review"("userId", "gameQid");

-- CreateIndex
CREATE INDEX "List_userId_updatedAt_idx" ON "List"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ListItem_listId_position_idx" ON "ListItem"("listId", "position");

-- AddForeignKey
ALTER TABLE "GamePlatform" ADD CONSTRAINT "GamePlatform_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlatform" ADD CONSTRAINT "GamePlatform_platformQid_fkey" FOREIGN KEY ("platformQid") REFERENCES "Platform"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTag" ADD CONSTRAINT "GameTag_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTag" ADD CONSTRAINT "GameTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCompany" ADD CONSTRAINT "GameCompany_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCompany" ADD CONSTRAINT "GameCompany_companyQid_fkey" FOREIGN KEY ("companyQid") REFERENCES "Company"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLog" ADD CONSTRAINT "GameLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLog" ADD CONSTRAINT "GameLog_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_gameQid_fkey" FOREIGN KEY ("gameQid") REFERENCES "Game"("qid") ON DELETE CASCADE ON UPDATE CASCADE;

