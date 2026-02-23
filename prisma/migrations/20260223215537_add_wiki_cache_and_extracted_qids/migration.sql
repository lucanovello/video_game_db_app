-- CreateTable
CREATE TABLE "WikiPageCache" (
    "id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "revid" BIGINT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentType" TEXT,
    "payloadJson" JSONB,
    "payloadText" TEXT,
    "headersJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPageCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikidataEntityCache" (
    "qid" TEXT NOT NULL,
    "lastrevid" BIGINT,
    "entityJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikidataEntityCache_pkey" PRIMARY KEY ("qid")
);

-- CreateTable
CREATE TABLE "ExtractedQid" (
    "id" TEXT NOT NULL,
    "pageCacheId" TEXT NOT NULL,
    "qid" TEXT NOT NULL,
    "extractor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedQid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiPageCache_site_idx" ON "WikiPageCache"("site");

-- CreateIndex
CREATE INDEX "WikiPageCache_revid_idx" ON "WikiPageCache"("revid");

-- CreateIndex
CREATE UNIQUE INDEX "WikiPageCache_site_title_key" ON "WikiPageCache"("site", "title");

-- CreateIndex
CREATE INDEX "WikidataEntityCache_lastrevid_idx" ON "WikidataEntityCache"("lastrevid");

-- CreateIndex
CREATE INDEX "ExtractedQid_qid_idx" ON "ExtractedQid"("qid");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedQid_pageCacheId_qid_key" ON "ExtractedQid"("pageCacheId", "qid");

-- AddForeignKey
ALTER TABLE "ExtractedQid" ADD CONSTRAINT "ExtractedQid_pageCacheId_fkey" FOREIGN KEY ("pageCacheId") REFERENCES "WikiPageCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;
