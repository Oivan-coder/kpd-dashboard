import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, createSessionToken, validateAccessCode, verifySessionToken } from "@/lib/access";

export async function GET() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  return NextResponse.json({
    authenticated: Boolean(session),
    role: session?.role ?? null,
    laboratory: session?.laboratory ?? null,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const session = await validateAccessCode(String(body.code ?? ""));
  if (!session) {
    return NextResponse.json({ error: "Неверный или отключённый код доступа" }, { status: 401 });
  }

  const response = NextResponse.json({
    authenticated: true,
    role: session.role,
    laboratory: session.laboratory,
  });
  response.cookies.set(COOKIE_NAME, createSessionToken(session), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false, role: null, laboratory: null });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
  return response;
}
