import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_NAME, saveClarification, verifySessionToken } from "@/lib/access";

export async function POST(request: Request) {
  const session = verifySessionToken(cookies().get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Требуется вход по коду ЦКДЛ" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  const responseText = String(body.response ?? "").trim();
  const confirmedBy = String(body.confirmedBy ?? "").trim();

  const lastDash = itemId.lastIndexOf("-");
  if (lastDash < 1) return NextResponse.json({ error: "Некорректная позиция" }, { status: 400 });

  const laboratory = itemId.slice(0, lastDash);
  const rowNumber = Number(itemId.slice(lastDash + 1));

  if (laboratory !== session.laboratory) {
    return NextResponse.json({ error: "Эта ЦКДЛ недоступна для редактирования" }, { status: 403 });
  }
  if (!responseText || !confirmedBy) {
    return NextResponse.json({ error: "Заполните ответ и ФИО подтверждающего" }, { status: 400 });
  }

  try {
    const saved = await saveClarification({ laboratory, rowNumber, response: responseText, confirmedBy });
    revalidatePath("/");
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить ответ" }, { status: 500 });
  }
}
