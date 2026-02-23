-- AddForeignKey
ALTER TABLE "PropertyUsage" ADD CONSTRAINT "PropertyUsage_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "WikidataProperty"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
