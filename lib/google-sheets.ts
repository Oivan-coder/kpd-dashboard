import "server-only";
import { google } from "googleapis";
import type { Analyzer, DashboardData, LaboratorySummary, VerificationStatus } from "./types";

export const LABS = ["Истра", "Лобня", "Одинцово", "Балашиха", "Королёв", "Коломна", "Домодедово", "Подольск"];

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
  if (!model || model === "#N/A" || manufacturer === "#N/A" || manufacturer === "Unknown") return "error";
  if (
    v.includes("треб") ||
    v.includes("зависит") ||
    v.includes("ориентир") ||
    v.includes("сохранено;")
  ) return "review";
  return "verified";
}

function questionFor(
  status: VerificationStatus,
  verification: string,
  manufacturer: string,
  model: string,
  sourceModel: string,
  serialList: string[],
  comment: string
): string | undefined {
  if (status !== "review" && status !== "error") return undefined;

  const joined = `${manufacturer} ${model} ${sourceModel} ${verification} ${comment}`.toLowerCase();

  if (joined.includes("xn-9000") || joined.includes("xn 9000")) {
    return "Укажите фактическую конфигурацию комплекса: количество аналитических модулей XN-10/XN-20 и наличие SP-10. Для каждого серийного номера укажите, к какому модулю он относится.";
  }
  if (joined.includes("acl top") && joined.includes("model not specified")) {
    return "Укажите точную модель коагулометра ACL TOP (например 350/550/700/750) и подтвердите серийный номер.";
  }
  if (joined.includes("oc-sensor")) {
    return "Укажите точную модификацию OC-SENSOR. У разных моделей семейства различается паспортная производительность.";
  }
  if (joined.includes("ku-2800") || manufacturer.toLowerCase() === "unknown") {
    return "Уточните производителя и точное наименование модели. Если это линия из нескольких модулей — перечислите состав и серийные номера.";
  }
  if (verification.toLowerCase().includes("режим")) {
    return "Уточните фактический режим работы прибора и используемую конфигурацию, от которой зависит производительность.";
  }
  if (verification.toLowerCase().includes("конфигурац")) {
    return "Укажите фактическую конфигурацию прибора/линии: количество аналитических модулей, их модели и серийные номера.";
  }
  if (verification.toLowerCase().includes("точной модели") || verification.toLowerCase().includes("модели")) {
    return "Укажите точного производителя и модель оборудования по шильдику/паспорту.";
  }
  if (verification.toLowerCase().includes("зависит от теста")) {
    return "Укажите основной профиль выполняемых тестов и режим работы, чтобы определить корректную производительность для расчёта КПД.";
  }
  if (verification.toLowerCase().includes("ориентир")) {
    return "Подтвердите модель, конфигурацию и фактическую паспортную производительность по паспорту или инструкции на установленный прибор.";
  }
  if (verification.toLowerCase().includes("провер")) {
    return "Подтвердите точную модель и паспортную производительность установленного прибора.";
  }

  const serialHint = serialList.length ? ` Серийный номер: ${serialList.join(", ")}.` : "";
  return `Подтвердите точную модель, конфигурацию и паспортную производительность оборудования.${serialHint}`;
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
  return (...names: string[]) => {
    for (const name of names) {
      const idx = map.get(name);
      if (idx != null) return idx;
    }
    return -1;
  };
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

export async function sheetsClient(readonly = true) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [readonly ? "https://www.googleapis.com/auth/spreadsheets.readonly" : "https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

async function getHourParameters() {
  const sheets = await sheetsClient(true);
  if (!sheets) return new Map<string, { proposed?: number; reason?: string; status?: string; approved?: number }>();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId:
        process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
        "1NzTRhs4UKyzW_fBBE_THU_ULNSKPZkGnkPrPou2WqNU",
      range: "'Параметры КПД'!A2:F1000",
      valueRenderOption: "FORMATTED_VALUE",
    });
    const map = new Map<string, { proposed?: number; reason?: string; status?: string; approved?: number }>();
    for (const row of response.data.values ?? []) {
      const itemId = text(row[0]);
      if (!itemId) continue;
      const proposed = num(row[2]) || undefined;
      const reason = text(row[3]) || undefined;
      const status = text(row[4]) || undefined;
      const approved = num(row[5]) || undefined;
      map.set(itemId, { proposed, reason, status, approved });
    }
    return map;
  } catch {
    return new Map<string, { proposed?: number; reason?: string; status?: string; approved?: number }>();
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    "1NzTRhs4UKyzW_fBBE_THU_ULNSKPZkGnkPrPou2WqNU";

  const sheets = await sheetsClient(true);
  if (!sheets) return fallback();

  const hourParameters = await getHourParameters();

  try {
    const ranges = [
      "'Расчет КПД'!A1:G20",
      ...LABS.map((lab) => `'${lab}'!A1:AP300`),
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
        organization: ix("Медицинская организация"),
        balanceType: ix("Балансодержатель (собственность/другое)", "Балансодержатель"),
        balanceHolderDetails: ix("Укажите, кто является балансодержателем и на каких условиях (лизинг/договор безвозмездного пользования)?"),
        level: ix("Тип лаборатории"),
        floor: ix("Этаж, на котором расположено оборудование"),
        address: ix("Адрес подразделения"),
        direction: ix("Вид оборудования", "Столбец1"),
        manufacturer: ix("Производитель (пример: Sysmex, Roche, Snibe, Ortho и другие)", "Производитель"),
        model: ix("Модель медицинского инвентаря (AU480, XN-9000 и другие)", "Модель медицинского инвентаря"),
        originalCapacity: ix("Пропускная способность тест/час", "Пропускная способность проб/час"),
        rawFact: ix("Факт за август (исходное сопоставление)"),
        inventoryNumber: ix("Инвентарный номер"),
        serial: ix("Серийный номер"),
        manufactureYear: ix("Год выпуска"),
        commissioningDate: ix("Дата ввода в эксплуатацию\\инсталляции", "Дата ввода в эксплуатацию"),
        usefulLife: ix("Срок полезного использования для расчета амортизации"),
        depreciation: ix("Текущий % износа (Амортизация)"),
        bregisConnection: ix("Подключение к БРЕГИС"),
        tech: ix("Статус технического состояния (В работе, законсервирован, сломан, списан и другие)", "Статус технического состояния"),
        responsiblePerson: ix("ФИО , должность, мобильный телефон ответственного, предоставившего сведения", "ФИО, должность, мобильный телефон ответственного, предоставившего сведения"),
        note: ix("Примечание", "Столбец2"),
        factUse: ix("Учитывать факт"),
        factCalc: ix("Факт в расчете"),
        powerUse: ix("Учитывать мощность"),
        monthlyPower: ix("Мощность за 210 часов"),
        reason: ix("Причина / комментарий"),
        sourceManufacturer: ix("Исходный производитель"),
        sourceModel: ix("Исходная модель"),
        sourceCapacity: ix("Исходная мощность"),
        acceptedPower: ix("Принятая паспортная мощность"),
        verification: ix("Статус верификации"),
        source: ix("Источник мощности"),
        powerComment: ix("Комментарий к мощности"),
        response: ix("Ответ ЦКДЛ"),
        confirmedBy: ix("Подтвердил ЦКДЛ"),
        confirmedAt: ix("Дата подтверждения"),
        responseStatus: ix("Статус ответа"),
        labComment: ix("Комментарий ЦКДЛ"),
        labCommentAuthor: ix("Автор комментария"),
        labCommentAt: ix("Дата комментария"),
      };

      rows.slice(1).forEach((row, rowIndex) => {
        const model = text(cell(row, c.model));
        const manufacturer = text(cell(row, c.manufacturer));
        if (!model && !manufacturer) return;

        const includedInKpi = yes(cell(row, c.powerUse));
        const factIncluded = yes(cell(row, c.factUse));
        const verification = text(cell(row, c.verification));
        const status = statusFromRow(includedInKpi, verification, model, manufacturer);
        const serialList = serials(cell(row, c.serial));
        const accepted = num(cell(row, c.acceptedPower)) || null;
        const itemId = `${lab}-${rowIndex + 2}`;
        const hourParam = hourParameters.get(itemId);
        const defaultHours = 210;
        const effectiveHours = hourParam?.approved || defaultHours;
        const monthlyCapacity = includedInKpi && accepted ? accepted * effectiveHours : 0;
        const rawFact = num(cell(row, c.rawFact));
        const factInCalculation = factIncluded ? num(cell(row, c.factCalc)) : 0;
        const rowKpi = monthlyCapacity > 0 && factInCalculation > 0 ? (factInCalculation / monthlyCapacity) * 100 : null;
        const powerComment = text(cell(row, c.powerComment));

        const issueParts = [
          status === "review" || status === "error" ? verification : "",
          status === "review" || status === "error" ? powerComment : "",
          status === "review" || status === "error" ? text(cell(row, c.reason)) : "",
        ].filter(Boolean);

        analyzers.push({
          id: itemId,
          rowNumber: rowIndex + 2,
          laboratory: lab,
          organization: text(cell(row, c.organization)),
          balanceType: text(cell(row, c.balanceType)),
          balanceHolderDetails: text(cell(row, c.balanceHolderDetails)),
          floor: text(cell(row, c.floor)),
          address: text(cell(row, c.address)),
          level: text(cell(row, c.level)),
          direction: text(cell(row, c.direction)),
          manufacturer,
          model,
          sourceManufacturer: text(cell(row, c.sourceManufacturer)),
          sourceModel: text(cell(row, c.sourceModel)),
          sourceCapacity: text(cell(row, c.sourceCapacity)),
          originalCapacity: text(cell(row, c.originalCapacity)),
          inventoryNumber: text(cell(row, c.inventoryNumber)),
          serials: serialList,
          manufactureYear: text(cell(row, c.manufactureYear)),
          commissioningDate: text(cell(row, c.commissioningDate)),
          usefulLife: text(cell(row, c.usefulLife)),
          depreciation: text(cell(row, c.depreciation)),
          bregisConnection: text(cell(row, c.bregisConnection)),
          technicalStatus: text(cell(row, c.tech)),
          responsiblePerson: text(cell(row, c.responsiblePerson)),
          note: text(cell(row, c.note)),
          status,
          verificationText: verification,
          capacityPerHour: accepted,
          capacityUnit: unitFor(text(cell(row, c.direction))),
          includedInKpi,
          rawFact,
          factIncluded,
          factInCalculation,
          monthlyCapacity,
          rowKpi,
          defaultHours,
          proposedHours: hourParam?.proposed,
          approvedHours: hourParam?.approved,
          effectiveHours,
          hoursReason: hourParam?.reason,
          hoursStatus: hourParam?.status,
          issue: issueParts.join(" · ") || undefined,
          question: questionFor(status, verification, manufacturer, model, text(cell(row, c.sourceModel)), serialList, powerComment),
          sourceUrl: text(cell(row, c.source)) || undefined,
          powerComment: powerComment || undefined,
          reasonComment: text(cell(row, c.reason)) || undefined,
          response: text(cell(row, c.response)) || undefined,
          confirmedBy: text(cell(row, c.confirmedBy)) || undefined,
          confirmedAt: text(cell(row, c.confirmedAt)) || undefined,
          responseStatus: text(cell(row, c.responseStatus)) || undefined,
          labComment: text(cell(row, c.labComment)) || undefined,
          labCommentAuthor: text(cell(row, c.labCommentAuthor)) || undefined,
          labCommentAt: text(cell(row, c.labCommentAt)) || undefined,
        });
      });
    });

    for (const lab of laboratories) {
      const rows = analyzers.filter((a) => a.laboratory === lab.name);
      const capacityRows = rows.filter((a) => a.includedInKpi && a.capacityPerHour);
      lab.reviewCount = rows.filter((a) => a.status === "review" || a.status === "error").length;
      lab.errorCount = rows.filter((a) => a.status === "error").length;
      lab.capacityPerHour = capacityRows.reduce((s, a) => s + (a.capacityPerHour || 0), 0);
      lab.monthlyCapacity = capacityRows.reduce((s, a) => s + a.monthlyCapacity, 0);
      lab.analyzers = capacityRows.length;
      lab.kpi = lab.monthlyCapacity > 0 ? lab.fact / lab.monthlyCapacity * 100 : 0;
    }

    const totalFact = laboratories.reduce((s, x) => s + x.fact, 0);
    const totalCapacityPerHour = laboratories.reduce((s, x) => s + x.capacityPerHour, 0);
    const totalMonthlyCapacity = laboratories.reduce((s, x) => s + x.monthlyCapacity, 0);
    const totalAnalyzersInCapacity = laboratories.reduce((s, x) => s + x.analyzers, 0);

    return {
      source: "google-sheets",
      updatedAt: new Date().toISOString(),
      totalKpi: totalMonthlyCapacity > 0 ? totalFact / totalMonthlyCapacity * 100 : 0,
      totalFact,
      totalCapacityPerHour,
      totalMonthlyCapacity,
      totalAnalyzersInCapacity,
      laboratories,
      analyzers,
    };
  } catch (error) {
    console.error("Google Sheets read failed", error);
    return fallback();
  }
}
