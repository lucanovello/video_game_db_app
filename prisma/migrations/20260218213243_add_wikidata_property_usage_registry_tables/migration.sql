-- CreateTable
CREATE TABLE "WikidataProperty" (
    "propertyId" TEXT NOT NULL,
    "labelEn" TEXT,
    "descriptionEn" TEXT,
    "datatype" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikidataProperty_pkey" PRIMARY KEY ("propertyId")
);

-- CreateTable
CREATE TABLE "PropertyUsage" (
    "propertyId" TEXT NOT NULL,
    "gamesWithProperty" INTEGER NOT NULL,
    "coveragePct" DOUBLE PRECISION NOT NULL,
    "totalStatements" INTEGER,
    "sampleGameIds" TEXT[],
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyUsage_pkey" PRIMARY KEY ("propertyId")
);

-- CreateIndex
CREATE INDEX "PropertyUsage_coveragePct_idx" ON "PropertyUsage"("coveragePct");

-- CreateIndex
CREATE INDEX "PropertyUsage_gamesWithProperty_idx" ON "PropertyUsage"("gamesWithProperty");
