import { prisma } from "./lib/prisma";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function formatFloat(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "";
}

async function main() {
  const rows = await prisma.propertyUsage.findMany({
    include: {
      property: {
        select: {
          labelEn: true,
          descriptionEn: true,
          datatype: true,
        },
      },
    },
    orderBy: [
      { coveragePct: "desc" },
      { gamesWithProperty: "desc" },
      { propertyId: "asc" },
    ],
  });

  const lines: string[] = [];
  lines.push(
    [
      "propertyId",
      "labelEn",
      "descriptionEn",
      "datatype",
      "gamesWithProperty",
      "coveragePct",
      "totalStatements",
      "sampleGameIds",
      "computedAt",
    ].join(","),
  );

  for (const row of rows) {
    lines.push(
      [
        row.propertyId,
        csvEscape(row.property?.labelEn ?? ""),
        csvEscape(row.property?.descriptionEn ?? ""),
        csvEscape(row.property?.datatype ?? ""),
        String(row.gamesWithProperty),
        formatFloat(row.coveragePct),
        row.totalStatements !== null ? String(row.totalStatements) : "",
        csvEscape(row.sampleGameIds.join("|")),
        row.computedAt.toISOString(),
      ].join(","),
    );
  }

  process.stdout.write(lines.join("\n"));
  process.stdout.write("\n");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
