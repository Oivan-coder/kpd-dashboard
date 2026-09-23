import "server-only";
import { google } from "googleapis";
import type { Analyzer, DashboardData, LaboratorySummary, VerificationStatus } from "./types";

const LABS = ["Истра", "Лобня", "Одинцово", "Балашиха", "Королёв", "Коломна", "Домодедово", "Подольск"];

const FALLBACK_SUMMARY = [
  ["Истра", 348993, 8934, 1876140, 18.6, 12, "Расчет завершен"],
  ["Лобня", 345042, 7089, 1488690, 23.2, 14, "Расчет завершен"],
  ["Одинцово", 363689, 4586, 963060, 37.8, 10, "Предварительно — задача не закрыта"],
  ["Балашиха", 756116, 9132, 1917720, 39.4, 20, "Расчет завершен"],
  ["Королёв", 1181651, 14127, 2966670, 39.8, 26, "Предварительно — задача не закрыта"],
  ["Коломна", 395627, 7070, 1484700, 26.6, 13, "Расчет завершен"],
  ["Домодедово", 484268, 7421, 1558410, 31.1, 18, "Расчет завершен"],
  ["Подольск", 323705, 4871, 1022910, 31.6, 9, "Расчет завершен"],
] as const;

function num(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace("%", "")
    .replace(",", ".");
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function yes(value: unknown): boolean {
  return /^да$/i.test(text(value));
}

function serials(value: unknown): string[] {
  return text(value)
    .split(/[;,/\n]+|\s{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function statusFromRow(
  includedInKpi: boolean,
  verification: string,
  model: string,
  manufacturer: string
): VerificationStatus {
  if (!includedInKpi) return "excluded";
  const v = verification.toLowerCase();
  if (!model || model === "#N/A" || manufacturer === "#N/A") return "error";
  if (v.includes("треб") || v.includes("сохранено") || v.includes("не проверено")) return "review";
  return "verified";
}

function unitFor(direction: string): "tests/hour" | "samples/hour" | null {
  const d = direction.toLowerCase();
  if (d.includes("гемат") || d.includes("моч")) return "samples/hour";
  if (d) return "tests/hour";
  return null;
}

function indexMap(headers: unknown[]) {
  const map = new Map<string, number>();
  headers.forEach((h, i) => map.set(text(h), i));
  return (name: string) => map.get(name) ?? -1;
}

function cell(row: unknown[], idx: number): unknown {
  return idx >= 0 ? row[idx] : undefined;
}

function fallback(): DashboardData {
  const laboratories: LaboratorySummary[] = FALLBACK_SUMMARY.map((r) => ({
    name: r[0],
    fact: r[1],
    capacityPerHour: r[2],
    monthlyCapacity: r[3],
    kpi: r[4],
    analyzers: r[5],
    reviewCount: 0,
    errorCount: 0,
    dataStatus: r[6],
  }));

  return {
    source: "fallback",
    updatedAt: new Date().toISOString(),
    totalKpi: 31.6,
    totalFact: 4199091,
    totalCapacityPerHour: 63230,
    totalMonthlyCapacity: 13278300,
    totalAnalyzersInCapacity: 122,
    laboratories,
    analyzers: [],
  };
}

async function sheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

export async function getDashboardData(): Promise<DashboardData> {
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    "1NzTRhs4UKyzW_fBBE_THU_ULNSKPZkGnkPrPou2WqNU";

  const sheets = await sheetsClient();
  if (!sheets) return fallback();

  try {
    const ranges = [
      "'Расчет КПД'!A1:G20",
      ...LABS.map((lab) => `'${lab}'!A1:AI300`),
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      valueRenderOption: "FORMATTED_VALUE",
    });

    const valueRanges = response.data.valueRanges ?? [];
    const summaryValues = valueRanges[0]?.values ?? [];

    const laboratories: LaboratorySummary[] = [];
    for (const row of summaryValues.slice(3)) {
      const name = text(row[0]);
      if (!LABS.includes(name)) continue;
      laboratories.push({
        name,
        fact: num(row[1]),
        capacityPerHour: num(row[2]),
        monthlyCapacity: num(row[3]),
        kpi: num(row[4]),
        analyzers: num(row[5]),
        reviewCount: 0,
        errorCount: 0,
        dataStatus: text(row[6]),
      });
    }

    const analyzers: Analyzer[] = [];

    LABS.forEach((lab, labIndex) => {
      const rows = valueRanges[labIndex + 1]?.values ?? [];
      if (!rows.length) return;

      const headers = rows[0];
      const ix = indexMap(headers);

      const c = {
        level: ix("Тип лаборатории"),
        direction: ix("Вид оборудования"),
        manufacturer: ix("Производитель (пример: Sysmex, Roche, Snibe, Ortho и другие)"),
        model: ix("Модель медицинского инвентаря (AU480, XN-9000 и другие)"),
        serial: ix("Серийный номер"),
        tech: ix("Статус технического состояния (В работе, законсервирован, сломан, списан и другие)"),
        factUse: ix("Учитывать факт"),
        powerUse: ix("Учитывать мощность"),
        reason: ix("Причина / комментарий"),
        sourceManufacturer: ix("Исходный производитель"),
        sourceModel: ix("Исходная модель"),
        acceptedPower: ix("Принятая паспортная мощность"),
        verification: ix("Статус верификации"),
        source: ix("Источник мощности"),
        powerComment: ix("Комментарий к мощности"),
      };

      rows.slice(1).forEach((row, rowIndex) => {
        const model = text(cell(row, c.model));
        const manufacturer = text(cell(row, c.manufacturer));
        if (!model && !manufacturer) return;

        const includedInKpi = yes(cell(row, c.powerUse));
        const verification = text(cell(row, c.verification));
        const status = statusFromRow(includedInKpi, verification, model, manufacturer);

        const issueParts = [
          status === "review" || status === "error" ? verification : "",
          status === "review" || status === "error" ? text(cell(row, c.powerComment)) : "",
          status === "review" || status === "error" ? text(cell(row, c.reason)) : "",
        ].filter(Boolean);

        analyzers.push({
          id: `${lab}-${rowIndex + 2}`,
          laboratory: lab,
          level: text(cell(row, c.level)),
          direction: text(cell(row, c.direction)),
          manufacturer,
          model,
          sourceManufacturer: text(cell(row, c.sourceManufacturer)),
          sourceModel: text(cell(row, c.sourceModel)),
          serials: serials(cell(row, c.serial)),
          technicalStatus: text(cell(row, c.tech)),
          status,
          verificationText: verification,
          capacityPerHour: num(cell(row, c.acceptedPower)) || null,
          capacityUnit: unitFor(text(cell(row, c.direction))),
          includedInKpi,
          factIncluded: yes(cell(row, c.factUse)),
          issue: issueParts.join(" · ") || undefined,
          sourceUrl: text(cell(row, c.source)) || undefined,
        });
      });
    });

    for (const lab of laboratories) {
      const rows = analyzers.filter((a) => a.laboratory === lab.name);
      lab.reviewCount = rows.filter((a) => a.status === "review").length;
      lab.errorCount = rows.filter((a) => a.status === "error").length;
    }

    const totalRow = summaryValues.find((r) => text(r[0]) === "ИТОГО");

    return {
      source: "google-sheets",
      updatedAt: new Date().toISOString(),
      totalKpi: num(totalRow?.[4]) || 31.6,
      totalFact: num(totalRow?.[1]) || 4199091,
      totalCapacityPerHour: num(totalRow?.[2]) || 63230,
      totalMonthlyCapacity: num(totalRow?.[3]) || 13278300,
      totalAnalyzersInCapacity: num(totalRow?.[5]) || 122,
      laboratories,
      analyzers,
    };
  } catch (error) {
    console.error("Google Sheets read failed", error);
    return fallback();
  }
}
