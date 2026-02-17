import { CompanyRole, TagKind } from "@prisma/client";

export const TAG_PROPERTY_SPECS: ReadonlyArray<{
  propertyId: string;
  kind: TagKind;
  source: string;
}> = [
  { propertyId: "P136", kind: TagKind.GENRE, source: "wikidata:P136" },
  { propertyId: "P179", kind: TagKind.SERIES, source: "wikidata:P179" },
  { propertyId: "P408", kind: TagKind.ENGINE, source: "wikidata:P408" },
  { propertyId: "P404", kind: TagKind.MODE, source: "wikidata:P404" },
  { propertyId: "P921", kind: TagKind.THEME, source: "wikidata:P921" },
  { propertyId: "P2572", kind: TagKind.KEYWORD, source: "wikidata:P2572" },
  { propertyId: "P8345", kind: TagKind.FRANCHISE, source: "wikidata:P8345" },
];

export const COMPANY_PROPERTY_SPECS: ReadonlyArray<{
  propertyId: string;
  role: CompanyRole;
}> = [
  { propertyId: "P178", role: CompanyRole.DEVELOPER },
  { propertyId: "P123", role: CompanyRole.PUBLISHER },
];
