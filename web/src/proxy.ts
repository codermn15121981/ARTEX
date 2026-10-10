import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_PAGES = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  // Mock demo: без настоящего входа, пропускаем все страницы (клиентская защита auth тоже пропустит).
  if (process.env.NEXT_PUBLIC_MOCK === "1") return NextResponse.next();

  const { pathname } = request.nextUrl;
  const token = request.cookies.get("artex_token")?.value;
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Не авторизован → переход на страницу входа
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // При авторизованном доступе к странице входа/инициализации → переход в основной интерфейс
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/function/tasks", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Пропускаем внутренние маршруты Next.js, API-маршруты, favicon и статические файлы из public/ (включая изображения, шрифты и т.д.)
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf)$).*)"],
};
