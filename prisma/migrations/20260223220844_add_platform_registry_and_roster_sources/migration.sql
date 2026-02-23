-- CreateTable
CREATE TABLE "PlatformRegistry" (
    "platformQid" TEXT NOT NULL,
    "nameLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRegistry_pkey" PRIMARY KEY ("platformQid")
);

-- CreateTable
CREATE TABLE "PlatformRosterSource" (
    "id" TEXT NOT NULL,
    "platformQid" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "pageTitle" TEXT NOT NULL,
    "pageUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRosterSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformRegistry_status_idx" ON "PlatformRegistry"("status");

-- CreateIndex
CREATE INDEX "PlatformRegistry_nameLabel_idx" ON "PlatformRegistry"("nameLabel");

-- CreateIndex
CREATE INDEX "PlatformRosterSource_platformQid_idx" ON "PlatformRosterSource"("platformQid");

-- CreateIndex
CREATE INDEX "PlatformRosterSource_sourceType_idx" ON "PlatformRosterSource"("sourceType");

-- CreateIndex
CREATE INDEX "PlatformRosterSource_isActive_idx" ON "PlatformRosterSource"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRosterSource_platformQid_sourceType_pageTitle_key" ON "PlatformRosterSource"("platformQid", "sourceType", "pageTitle");

-- AddForeignKey
ALTER TABLE "PlatformRosterSource" ADD CONSTRAINT "PlatformRosterSource_platformQid_fkey" FOREIGN KEY ("platformQid") REFERENCES "PlatformRegistry"("platformQid") ON DELETE CASCADE ON UPDATE CASCADE;
