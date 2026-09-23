import "server-only";
import crypto from "crypto";
import { sheetsClient, LABS } from "./google-sheets";

export const COOKIE_NAME = "kpd_access";
export type AccessSession = { role: "admin" | "lab"; laboratory: string | null };

function spreadsheetId() {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1NzTRhs4UKyzW_fBBE_THU_ULNSKPZkGnkPrPou2WqNU";
}

function secret() {
  return process.env.ACCESS_SESSION_SECRET || process.env.GOOGLE_PRIVATE_KEY || "kpd-dashboard-session";
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(session: AccessSession) {
  const payload = Buffer.from(JSON.stringify({
    ...session,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null): AccessSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (parsed.role === "admin") return { role: "admin", laboratory: null };
    if (parsed.role === "lab" && LABS.includes(parsed.laboratory)) {
      return { role: "lab", laboratory: parsed.laboratory };
    }
    return null;
  } catch {
    return null;
  }
}

export async function validateAccessCode(code: string): Promise<AccessSession | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const sheets = await sheetsClient(true);
  if (!sheets) return null;

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: "'Доступы'!A2:C50",
    valueRenderOption: "FORMATTED_VALUE",
  });

  for (const row of result.data.values ?? []) {
    const subject = String(row[0] ?? "").trim();
    const stored = String(row[1] ?? "").trim().toUpperCase();
    const active = String(row[2] ?? "").trim().toLowerCase() === "да";
    if (!active || stored !== clean) continue;
    if (subject === "ADMIN") return { role: "admin", laboratory: null };
    if (LABS.includes(subject)) return { role: "lab", laboratory: subject };
  }
  return null;
}

function parseItemId(itemId: string) {
  const lastDash = itemId.lastIndexOf("-");
  if (lastDash < 1) throw new Error("Invalid item id");
  const laboratory = itemId.slice(0, lastDash);
  const rowNumber = Number(itemId.slice(lastDash + 1));
  if (!LABS.includes(laboratory) || !Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 1000) {
    throw new Error("Invalid item id");
  }
  return { laboratory, rowNumber };
}

async function rowIdentity(laboratory: string, rowNumber: number) {
  const sheets = await sheetsClient(false);
  if (!sheets) throw new Error("Sheets client unavailable");
  const id = spreadsheetId();
  const before = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${laboratory}'!A${rowNumber}:AP${rowNumber}`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const row = before.data.values?.[0] ?? [];
  return {
    sheets,
    id,
    row,
    model: String(row[8] ?? "").trim(),
    serial: String(row[13] ?? "").trim(),
  };
}

async function appendLog(values: string[]) {
  const sheets = await sheetsClient(false);
  if (!sheets) throw new Error("Sheets client unavailable");
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: "'Журнал изменений'!A:J",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

export async function saveClarification(args: {
  laboratory: string;
  rowNumber: number;
  response: string;
  confirmedBy: string;
}) {
  const { laboratory, rowNumber, response, confirmedBy } = args;
  if (!LABS.includes(laboratory)) throw new Error("Unknown laboratory");
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 1000) throw new Error("Invalid row");
  if (!response.trim() || !confirmedBy.trim()) throw new Error("Response and name are required");

  const { sheets, id, row, model, serial } = await rowIdentity(laboratory, rowNumber);
  const oldResponse = String(row[35] ?? "").trim();
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'${laboratory}'!AJ${rowNumber}:AM${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[response.trim(), confirmedBy.trim(), now, "Получен ответ"]] },
  });

  await appendLog([
    now, laboratory, String(rowNumber), model, serial, "Ответ ЦКДЛ",
    oldResponse, response.trim(), confirmedBy.trim(), "Получен ответ",
  ]);

  return { laboratory, rowNumber, now };
}

export async function saveEquipmentComment(args: {
  itemId: string;
  comment: string;
  author: string;
  session: AccessSession;
}) {
  const { laboratory, rowNumber } = parseItemId(args.itemId);
  if (args.session.role === "lab" && args.session.laboratory !== laboratory) {
    throw new Error("Forbidden");
  }
  if (!args.comment.trim() || !args.author.trim()) throw new Error("Comment and author are required");

  const { sheets, id, row, model, serial } = await rowIdentity(laboratory, rowNumber);
  const oldComment = String(row[39] ?? "").trim();
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'${laboratory}'!AN${rowNumber}:AP${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[args.comment.trim(), args.author.trim(), now]] },
  });

  await appendLog([
    now, laboratory, String(rowNumber), model, serial, "Комментарий ЦКДЛ",
    oldComment, args.comment.trim(), args.author.trim(), "Комментарий",
  ]);

  return { laboratory, rowNumber, now };
}

async function ensureParametersSheet() {
  const sheets = await sheetsClient(false);
  if (!sheets) throw new Error("Sheets client unavailable");
  const id = spreadsheetId();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: "sheets.properties",
  });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === "Параметры КПД");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: "Параметры КПД",
              gridProperties: { rowCount: 1000, columnCount: 8 },
            },
          },
        }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: "'Параметры КПД'!A1:H1",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          "ID позиции","ЦКДЛ","Предложенные часы/мес","Причина","Статус","Утверждённые часы/мес","Автор","Дата изменения"
        ]],
      },
    });
  }
  return { sheets, id };
}

async function upsertHourParameter(args: {
  itemId: string;
  laboratory: string;
  proposedHours?: number;
  reason?: string;
  status: string;
  approvedHours?: number;
  author: string;
}) {
  const { sheets, id } = await ensureParametersSheet();
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: "'Параметры КПД'!A2:H1000",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = read.data.values ?? [];
  const index = rows.findIndex((r) => String(r[0] ?? "").trim() === args.itemId);
  const values = [[
    args.itemId,
    args.laboratory,
    args.proposedHours ?? "",
    args.reason ?? "",
    args.status,
    args.approvedHours ?? "",
    args.author,
    now,
  ]];

  if (index >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `'Параметры КПД'!A${index + 2}:H${index + 2}`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: "'Параметры КПД'!A:H",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
  }
  return now;
}

export async function proposeCalculationHours(args: {
  itemId: string;
  hours: number;
  reason: string;
  author: string;
  session: AccessSession;
}) {
  const { laboratory } = parseItemId(args.itemId);
  if (args.session.role === "lab" && args.session.laboratory !== laboratory) throw new Error("Forbidden");
  if (!Number.isFinite(args.hours) || args.hours <= 0 || args.hours > 744) throw new Error("Invalid hours");
  if (!args.reason.trim() || !args.author.trim()) throw new Error("Reason and author are required");

  const now = await upsertHourParameter({
    itemId: args.itemId,
    laboratory,
    proposedHours: args.hours,
    reason: args.reason.trim(),
    status: "На согласовании",
    author: args.author.trim(),
  });

  await appendLog([
    now, laboratory, args.itemId.split("-").pop() || "", "", "", "Расчётные часы",
    "210", String(args.hours), args.author.trim(), "На согласовании",
  ]);

  return { laboratory, now };
}

export async function reviewCalculationHours(args: {
  itemId: string;
  approved: boolean;
  adminName: string;
}) {
  const { laboratory } = parseItemId(args.itemId);
  const sheets = await sheetsClient(true);
  if (!sheets) throw new Error("Sheets client unavailable");
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: "'Параметры КПД'!A2:H1000",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const row = (read.data.values ?? []).find((r) => String(r[0] ?? "").trim() === args.itemId);
  if (!row) throw new Error("Hours proposal not found");
  const proposed = Number(String(row[2] ?? "").replace(",", "."));
  if (!Number.isFinite(proposed) || proposed <= 0) throw new Error("Invalid proposal");

  const now = await upsertHourParameter({
    itemId: args.itemId,
    laboratory,
    proposedHours: proposed,
    reason: String(row[3] ?? ""),
    status: args.approved ? "Утверждено" : "Отклонено",
    approvedHours: args.approved ? proposed : undefined,
    author: args.adminName.trim(),
  });

  await appendLog([
    now, laboratory, args.itemId.split("-").pop() || "", "", "", "Статус расчётных часов",
    "На согласовании", args.approved ? "Утверждено" : "Отклонено", args.adminName.trim(),
    args.approved ? "Утверждено" : "Отклонено",
  ]);

  return { laboratory, now };
}

export async function reviewClarification(args: {
  itemId: string;
  status: "Принято" | "На доработку";
  adminName: string;
}) {
  const { laboratory, rowNumber } = parseItemId(args.itemId);
  if (!args.adminName.trim()) throw new Error("Admin name required");

  const { sheets, id, row, model, serial } = await rowIdentity(laboratory, rowNumber);
  const oldStatus = String(row[38] ?? "").trim();
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'${laboratory}'!AM${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[args.status]] },
  });

  await appendLog([
    now, laboratory, String(rowNumber), model, serial, "Статус ответа",
    oldStatus, args.status, args.adminName.trim(), args.status,
  ]);

  return { laboratory, rowNumber, status: args.status, now };
}
