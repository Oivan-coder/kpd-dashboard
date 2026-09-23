import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_NAME, reviewClarification, verifySessionToken } from "@/lib/access";

export async function POST(request: Request) {
  const session = verifySessionToken(cookies().get(COOKIE_NAME)?.value);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  const status = String(body.status ?? "");
  const adminName = String(body.adminName ?? "").trim();

  if (status !== "Принято" && status !== "На доработку") {
    return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
  }

  try {
    const saved = await reviewClarification({
      itemId,
      status,
      adminName,
    });
    revalidatePath("/");
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось изменить статус" }, { status: 500 });
  }
}
