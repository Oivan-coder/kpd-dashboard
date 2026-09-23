import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_NAME, saveEquipmentComment, verifySessionToken } from "@/lib/access";

export async function POST(request: Request) {
  const session = verifySessionToken(cookies().get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  const comment = String(body.comment ?? "").trim();
  const author = String(body.author ?? "").trim();

  if (!itemId || !comment || !author) {
    return NextResponse.json({ error: "Заполните комментарий и автора" }, { status: 400 });
  }

  try {
    const saved = await saveEquipmentComment({ itemId, comment, author, session });
    revalidatePath("/");
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.message === "Forbidden"
      ? "Эта позиция недоступна для редактирования"
      : "Не удалось сохранить комментарий";
    return NextResponse.json({ error: message }, { status: message.startsWith("Эта") ? 403 : 500 });
  }
}
