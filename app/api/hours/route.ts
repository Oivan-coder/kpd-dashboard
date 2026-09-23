import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_NAME, proposeCalculationHours, verifySessionToken } from "@/lib/access";

export async function POST(request: Request) {
  const session = verifySessionToken(cookies().get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  const hours = Number(body.hours);
  const reason = String(body.reason ?? "").trim();
  const author = String(body.author ?? "").trim();

  if (!itemId || !Number.isFinite(hours) || !reason || !author) {
    return NextResponse.json({ error: "Заполните часы, причину и автора" }, { status: 400 });
  }

  try {
    const saved = await proposeCalculationHours({ itemId, hours, reason, author, session });
    revalidatePath("/");
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    console.error(error);
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Forbidden") return NextResponse.json({ error: "Эта позиция недоступна" }, { status: 403 });
    if (msg === "Invalid hours") return NextResponse.json({ error: "Часы должны быть больше 0 и не более 744" }, { status: 400 });
    return NextResponse.json({ error: "Не удалось сохранить предложение" }, { status: 500 });
  }
}
