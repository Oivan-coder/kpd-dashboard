import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  COOKIE_NAME,
  reviewCalculationHours,
  reviewClarification,
  verifySessionToken,
} from "@/lib/access";

export async function POST(request: Request) {
  const session = verifySessionToken(cookies().get(COOKIE_NAME)?.value);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  const adminName = String(body.adminName ?? "").trim();

  if (!itemId || !adminName) {
    return NextResponse.json({ error: "Укажите позицию и администратора" }, { status: 400 });
  }

  try {
    if (body.kind === "hours") {
      const saved = await reviewCalculationHours({
        itemId,
        approved: Boolean(body.approved),
        adminName,
      });
      revalidatePath("/");
      return NextResponse.json({ ok: true, ...saved });
    }

    const status = String(body.status ?? "");
    if (status !== "Принято" && status !== "На доработку") {
      return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
    }

    const saved = await reviewClarification({ itemId, status, adminName });
    revalidatePath("/");
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось изменить статус" }, { status: 500 });
  }
}
