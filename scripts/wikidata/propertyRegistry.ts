import {
  AgeRatingOrganization,
  CompanyRole,
  ExternalGameCategory,
  GameRelationKind,
  GameImageKind,
  TagKind,
  VideoProvider,
  WebsiteCategory,
} from "@prisma/client";

export type PropertyStatus = "core" | "common" | "niche" | "ignore";
export type PropertyCardinality = "single" | "multi";
export type PropertyValueType =
  | "item"
  | "time"
  | "string"
  | "quantity"
  | "external-id"
  | "monolingualtext";

export type PropertyTarget =
  | "game.instanceOf"
  | "game.image"
  | "game.releaseDate"
  | "gamePlatform"
  | "gameTag"
  | "gameCompany"
  | "gameRelation"
  | "website"
  | "externalGame"
  | "gameVideo"
  | "gameAgeRating";

export interface PropertyQualifierRule {
  id: string;
  notes: string;
}

export interface PropertyRegistryEntry {
  propertyId: string;
  label: string;
  status: PropertyStatus;
  target: PropertyTarget;
  cardinality: PropertyCardinality;
  valueType: PropertyValueType;
  source: string;
  tagKind?: TagKind;
  companyRole?: CompanyRole;
  relationKind?: GameRelationKind;
  websiteCategory?: WebsiteCategory;
  externalCategory?: ExternalGameCategory;
  videoProvider?: VideoProvider;
  imageKind?: GameImageKind;
  ageRatingOrganization?: AgeRatingOrganization;
  qualifierRules?: PropertyQualifierRule[];
}

export const PROPERTY_REGISTRY: ReadonlyArray<PropertyRegistryEntry> = [
  {
    propertyId: "P31",
    label: "instance of",
    status: "core",
    target: "game.instanceOf",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P31",
  },
  {
    propertyId: "P400",
    label: "platform",
    status: "core",
    target: "gamePlatform",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P400",
  },
  {
    propertyId: "P136",
    label: "genre",
    status: "core",
    target: "gameTag",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P136",
    tagKind: TagKind.GENRE,
  },
  {
    propertyId: "P179",
    label: "part of the series",
    status: "common",
    target: "gameTag",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P179",
    tagKind: TagKind.SERIES,
  },
  {
    propertyId: "P155",
    label: "follows",
    status: "common",
    target: "gameRelation",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P155",
    relationKind: GameRelationKind.FOLLOWS,
  },
  {
    propertyId: "P156",
    label: "followed by",
    status: "common",
    target: "gameRelation",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P156",
    relationKind: GameRelationKind.FOLLOWED_BY,
  },
  {
    propertyId: "P408",
    label: "software engine",
    status: "common",
    target: "gameTag",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P408",
    tagKind: TagKind.ENGINE,
  },
  {
    propertyId: "P404",
    label: "game mode",
    status: "common",
    target: "gameTag",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P404",
    tagKind: TagKind.MODE,
  },
  {
    propertyId: "P921",
    label: "main subject",
    status: "niche",
    target: "gameTag",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P921",
    tagKind: TagKind.THEME,
  },
  {
    propertyId: "P2572",
    label: "hashtag",
    status: "niche",
    target: "gameTag",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P2572",
    tagKind: TagKind.KEYWORD,
  },
  {
    propertyId: "P8345",
    label: "media franchise",
    status: "common",
    target: "gameTag",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P8345",
    tagKind: TagKind.FRANCHISE,
  },
  {
    propertyId: "P577",
    label: "publication date",
    status: "core",
    target: "game.releaseDate",
    cardinality: "multi",
    valueType: "time",
    source: "wikidata:P577",
    qualifierRules: [
      {
        id: "platform-region-release",
        notes:
          "Placeholder: support platform-specific (P400) and region-specific (P291/P3005) qualifiers when needed.",
      },
    ],
  },
  {
    propertyId: "P178",
    label: "developer",
    status: "core",
    target: "gameCompany",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P178",
    companyRole: CompanyRole.DEVELOPER,
  },
  {
    propertyId: "P123",
    label: "publisher",
    status: "core",
    target: "gameCompany",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P123",
    companyRole: CompanyRole.PUBLISHER,
  },
  {
    propertyId: "P856",
    label: "official website",
    status: "core",
    target: "website",
    cardinality: "multi",
    valueType: "string",
    source: "wikidata:P856",
    websiteCategory: WebsiteCategory.OFFICIAL,
  },
  {
    propertyId: "P18",
    label: "image",
    status: "core",
    target: "game.image",
    cardinality: "multi",
    valueType: "string",
    source: "wikidata:P18",
    imageKind: GameImageKind.COVER,
  },
  {
    propertyId: "P852",
    label: "ESRB rating",
    status: "common",
    target: "gameAgeRating",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P852",
    ageRatingOrganization: AgeRatingOrganization.ESRB,
  },
  {
    propertyId: "P908",
    label: "PEGI rating",
    status: "common",
    target: "gameAgeRating",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P908",
    ageRatingOrganization: AgeRatingOrganization.PEGI,
  },
  {
    propertyId: "P1733",
    label: "Steam App ID",
    status: "common",
    target: "externalGame",
    cardinality: "multi",
    valueType: "external-id",
    source: "wikidata:P1733",
    externalCategory: ExternalGameCategory.STEAM,
  },
  {
    propertyId: "P2725",
    label: "GOG ID",
    status: "common",
    target: "externalGame",
    cardinality: "multi",
    valueType: "external-id",
    source: "wikidata:P2725",
    externalCategory: ExternalGameCategory.GOG,
  },
  {
    propertyId: "P1651",
    label: "YouTube video ID",
    status: "niche",
    target: "gameVideo",
    cardinality: "multi",
    valueType: "string",
    source: "wikidata:P1651",
    videoProvider: VideoProvider.YOUTUBE,
  },
  {
    propertyId: "P279",
    label: "subclass of",
    status: "ignore",
    target: "game.instanceOf",
    cardinality: "multi",
    valueType: "item",
    source: "wikidata:P279",
  },
];

export const PROPERTY_REGISTRY_BY_ID = new Map(
  PROPERTY_REGISTRY.map((entry) => [entry.propertyId, entry]),
);

export function getTagPropertySpecs(): ReadonlyArray<{
  propertyId: string;
  kind: TagKind;
  source: string;
}> {
  return PROPERTY_REGISTRY.filter(
    (entry): entry is PropertyRegistryEntry & { tagKind: TagKind } =>
      entry.target === "gameTag" && entry.tagKind !== undefined,
  ).map((entry) => ({
    propertyId: entry.propertyId,
    kind: entry.tagKind,
    source: entry.source,
  }));
}

export function getCompanyPropertySpecs(): ReadonlyArray<{
  propertyId: string;
  role: CompanyRole;
}> {
  return PROPERTY_REGISTRY.filter(
    (entry): entry is PropertyRegistryEntry & { companyRole: CompanyRole } =>
      entry.target === "gameCompany" && entry.companyRole !== undefined,
  ).map((entry) => ({
    propertyId: entry.propertyId,
    role: entry.companyRole,
  }));
}

export function getHydratableRegistryEntries(
  includeNiche = true,
): PropertyRegistryEntry[] {
  return PROPERTY_REGISTRY.filter((entry) => {
    if (entry.status === "ignore") return false;
    if (!includeNiche && entry.status === "niche") return false;
    return true;
  });
}
