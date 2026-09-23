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
