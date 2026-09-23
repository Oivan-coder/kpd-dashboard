import "server-only";
import crypto from "crypto";
import { sheetsClient, LABS } from "./google-sheets";

const COOKIE_NAME = "kpd_access";

function spreadsheetId() {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1NzTRhs4UKyzW_fBBE_THU_ULNSKPZkGnkPrPou2WqNU";
}

function secret() {
  return process.env.ACCESS_SESSION_SECRET || process.env.GOOGLE_PRIVATE_KEY || "kpd-dashboard-session";
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(laboratory: string) {
  const payload = Buffer.from(JSON.stringify({
    laboratory,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null): { laboratory: string } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!LABS.includes(parsed.laboratory) || !parsed.exp || parsed.exp < Date.now()) return null;
    return { laboratory: parsed.laboratory };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };

export async function validateAccessCode(code: string) {
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
    const lab = String(row[0] ?? "").trim();
    const stored = String(row[1] ?? "").trim().toUpperCase();
    const active = String(row[2] ?? "").trim().toLowerCase() === "да";
    if (active && stored === clean && LABS.includes(lab)) return lab;
  }
  return null;
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

  const sheets = await sheetsClient(false);
  if (!sheets) throw new Error("Sheets client unavailable");
  const id = spreadsheetId();

  const before = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${laboratory}'!A${rowNumber}:AM${rowNumber}`,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const row = before.data.values?.[0] ?? [];
  const model = String(row[8] ?? "").trim();
  const serial = String(row[13] ?? "").trim();
  const oldResponse = String(row[35] ?? "").trim();
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'${laboratory}'!AJ${rowNumber}:AM${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[response.trim(), confirmedBy.trim(), now, "Получен ответ"]],
    },
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: "'Журнал изменений'!A:J",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        now,
        laboratory,
        String(rowNumber),
        model,
        serial,
        "Ответ ЦКДЛ",
        oldResponse,
        response.trim(),
        confirmedBy.trim(),
        "Получен ответ",
      ]],
    },
  });

  return { laboratory, rowNumber, now };
}
