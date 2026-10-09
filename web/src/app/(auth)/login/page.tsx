"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const termsBodyRef = useRef<HTMLDivElement>(null);

  // Нажать «Согласен» можно только после прокрутки условий до конца (включая
  // случай, когда контент и так целиком виден без скролла).
  function handleTermsScroll() {
    const el = termsBodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
  }

  useEffect(() => {
    if (!termsOpen) return;
    // Сбрасываем при открытии и обрабатываем случай, когда контента меньше
    // экрана и скролл не срабатывает.
    setReadToEnd(false);
    const el = termsBodyRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  }, [termsOpen]);

  useEffect(() => {
    // Если уже вошли — сразу в основной интерфейс (при статическом экспорте
    // нет middleware, которое сделало бы этот редирект за нас).
    const token = auth.getToken();
    if (token) {
      // В localStorage учётные данные могут остаться, даже если cookie уже
      // потеряна. Сначала синхронизируем, затем делаем новый запрос — иначе
      // серверный guard или кэш роутинга может вернуть на страницу входа,
      // которая всё ещё в состоянии checking.
      auth.setToken(token);
      window.location.replace("/function/tasks");
      return;
    }
    api
      .authStatus()
      .then(({ initialized }) => {
        if (!initialized) router.replace("/setup");
      })
      .catch(() => setError("Не удалось подключиться к серверу"))
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("Сначала прочитайте и примите «Условия использования»");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { token } = await api.login("ARTEX", password);
      auth.setToken(token);
      window.location.replace("/function/tasks");
    } catch {
      setError("Неверное имя пользователя или пароль");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-muted-foreground">
        Проверка статуса входа…
      </div>
    );
  }

  return (
    <div className="flex h-dvh">
      {/* Left panel */}
      <div className="hidden flex-col items-center justify-center bg-primary p-12 text-center lg:flex lg:w-1/3">
        <div className="relative flex items-center justify-center">
          <div className="absolute size-80 rounded-full border border-primary-foreground/10" />
          <div className="absolute size-60 rounded-full border border-primary-foreground/15" />
          <div className="absolute size-40 rounded-full border border-primary-foreground/20" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="ARTEX" width={160} height={160} className="relative brightness-0 invert" />
        </div>
      </div>

      {/* Right panel */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <h2 className="text-2xl font-medium tracking-tight">Вход</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              С возвращением! Введите пароль, чтобы продолжить работу с ARTEX
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Имя пользователя</Label>
              <Input id="username" value="ARTEX" readOnly className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                autoFocus
                autoComplete="current-password"
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="agree-terms"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="agree-terms" className="text-sm font-normal leading-relaxed text-muted-foreground">
                Я прочитал(а) и согласен(на) с
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="mx-0.5 font-medium text-primary underline-offset-4 hover:underline"
                >
                  «Условиями использования»
                </button>
              </Label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !password || !agreed}>
              {loading ? "Вход…" : "Войти"}
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="flex-row items-center gap-3 border-b px-6 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-base">Условия использования и отказ от ответственности ARTEX</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Версия v1.0 · Дата вступления в силу: 2026-09-18 · Пожалуйста, полностью прочитайте все условия ниже
                перед входом
              </p>
            </div>
          </DialogHeader>

          <div
            ref={termsBodyRef}
            onScroll={handleTermsScroll}
            className="max-h-[60vh] space-y-5 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p className="rounded-lg border bg-muted/40 p-3 text-foreground/80">
              Эти «Условия использования и отказ от ответственности» (далее — «настоящее заявление») представляют
              собой договорённость между вами и авторами и контрибьюторами проекта ARTEX об использовании этого
              программного обеспечения. Перед использованием внимательно прочитайте и полностью поймите содержание
              всех условий, особенно пункты об отказе от ответственности, ограничении ответственности и запретах,
              выделенные жирным шрифтом или цветными блоками.
              <span className="font-medium text-foreground">
                {" "}
                Скачивая, устанавливая, получая доступ или каким-либо образом используя это программное обеспечение,
                вы подтверждаете, что прочитали, поняли и согласны соблюдать все условия настоящего заявления.
              </span>
            </p>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  1
                </span>
                Статья 1 · Определения и лицензия с открытым исходным кодом
              </h4>
              <p className="pl-7">
                Это программное обеспечение (ARTEX) распространяется как проект с открытым исходным кодом по
                лицензии GNU Affero General Public License v3.0 (AGPL-3.0). Вы можете свободно использовать,
                копировать, изменять и распространять его по условиям этой лицензии; однако любые производные работы
                (включая онлайн-сервисы, предоставляемые третьим лицам через сеть) также должны быть открыты по
                лицензии AGPL-3.0, с раскрытием пользователям полного соответствующего исходного кода. Полные условия
                AGPL-3.0 приведены в прилагаемом файле LICENSE.
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  2
                </span>
                Статья 2 · Разрешённая область использования
              </h4>
              <p className="pl-7">
                Это программное обеспечение предназначено только для личного обучения, изучения кода, обсуждения
                принципов технологий безопасности, а также для технической проверки в самостоятельно развёрнутой
                локальной изолированной среде; оно подходит для обучения, академических исследований, код-ревью и
                других неатакующих, неразрушительных целей. За пределами случаев, явно разрешённых этой статьёй, вы
                не можете использовать это программное обеспечение для каких-либо иных целей.
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="flex items-center gap-2 font-medium text-destructive">
                <span className="flex size-5 items-center justify-center rounded-md bg-destructive/10 text-xs font-semibold text-destructive">
                  3
                </span>
                <AlertTriangle className="size-4" />
                Статья 3 · Запрещённые действия
              </h4>
              <ul className="ml-7 list-decimal space-y-1.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 pl-8 text-foreground/80 marker:text-destructive/70">
                <li>
                  Категорически запрещено проводить сканирование, зондирование, эксплуатацию или атаки на любые
                  сайты, онлайн-сервисы, а также системы, подключённые к сети и принадлежащие другим лицам или
                  третьим сторонам (независимо от наличия авторизации и от того, являются ли они вашими собственными
                  активами);
                </li>
                <li>
                  Запрещено использовать это программное обеспечение для какого-либо реального пентестинга,
                  состязаний «атака-защита», red/blue team учений или в production-среде;
                </li>
                <li>
                  Запрещено использовать это программное обеспечение для незаконного проникновения, кражи данных,
                  вымогательства, отказа в обслуживании (DoS/DDoS) или любой другой деструктивной, преступной
                  деятельности;
                </li>
                <li>
                  Запрещено удалять, изменять или обходить любую информацию об авторских правах, лицензиях или
                  предупреждениях безопасности в этом программном обеспечении и его выводе;
                </li>
                <li>
                  Запрещено совершать любые действия, нарушающие законы, нормативные акты и регулирующие требования
                  вашей страны или региона.
                </li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  4
                </span>
                Статья 4 · Интеллектуальная собственность
              </h4>
              <p className="pl-7">
                Авторские права и связанная с ними интеллектуальная собственность на это программное обеспечение
                принадлежат авторам и контрибьюторам проекта, и соответствующие права предоставляются вам в пределах,
                определённых лицензией AGPL-3.0. За пределами прав, явно предоставленных этой лицензией, настоящее
                заявление не предоставляет вам никаких иных прав, ни явно, ни подразумеваемо.
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  5
                </span>
                Статья 5 · Данные и приватность
              </h4>
              <p className="pl-7">
                Это программное обеспечение — проект с открытым исходным кодом для самостоятельного развёртывания;
                автор не управляет никаким централизованным сервисом и не собирает и не загружает данные о вашем
                использовании. Все данные, которые вы создаёте, обрабатываете или с которыми взаимодействуете в
                процессе использования, находятся полностью под вашим контролем, и вы несёте ответственность за их
                законность и безопасность; любые последствия ненадлежащей обработки данных вы несёте самостоятельно.
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  6
                </span>
                Статья 6 · Соответствие законодательству и юридическая ответственность
              </h4>
              <p className="pl-7">
                Вы обязаны самостоятельно соблюдать все законы и нормативные акты своей страны или региона в области
                кибербезопасности, безопасности данных, защиты персональной информации и компьютерных преступлений
                (для материкового Китая это включает, но не ограничивается, «Законом о кибербезопасности», «Законом
                о безопасности данных», «Законом о защите личной информации» и связанными судебными разъяснениями).
                <span className="font-medium text-foreground">
                  {" "}
                  Любая юридическая ответственность и последствия, возникшие в результате нарушения вами указанных
                  выше законов и нормативных актов или условий настоящего заявления, лежат исключительно на вас и не
                  касаются авторов и контрибьюторов этого программного обеспечения.
                </span>
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  7
                </span>
                Статья 7 · Отказ от ответственности и ограничение ответственности
              </h4>
              <p className="pl-7">
                Это программное обеспечение предоставляется на условиях «как есть» (AS IS) и «как доступно» (AS
                AVAILABLE), без каких-либо явных или подразумеваемых гарантий, включая, но не ограничиваясь, гарантии
                товарной пригодности, соответствия определённой цели, точности и отсутствия нарушения прав. В
                максимальной степени, разрешённой применимым законодательством, авторы и контрибьюторы этого
                программного обеспечения не несут ответственности за любые прямые, косвенные, случайные, особые или
                косвенные убытки, возникшие в результате использования или невозможности использования этого
                программного обеспечения (независимо от того, использовалось ли оно надлежащим образом), включая, но
                не ограничиваясь, потерю данных, повреждение систем, прерывание бизнеса, потерю прибыли или
                юридические споры.
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  8
                </span>
                Статья 8 · Изменение условий и окончательное толкование
              </h4>
              <p className="pl-7">
                Автор имеет право периодически обновлять настоящее заявление в соответствии с законодательством или
                потребностями развития проекта; обновлённая версия публикуется вместе с проектом и вступает в силу с
                даты публикации; продолжение использования вами этого программного обеспечения считается принятием
                пересмотренных условий. В пределах, разрешённых законом, право окончательного толкования настоящего
                заявления принадлежит автору проекта. Если какое-либо из условий настоящего заявления будет признано
                недействительным, это не влияет на действительность остальных условий.
              </p>
            </section>
          </div>

          <DialogFooter className="mx-0 mb-0 flex-col items-stretch gap-2 rounded-b-xl px-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {readToEnd ? "Вы просмотрели все условия" : "Прокрутите условия до конца, затем подтвердите"}
            </p>
            <DialogClose asChild>
              <Button
                type="button"
                disabled={!readToEnd}
                onClick={() => {
                  setAgreed(true);
                  setError("");
                }}
              >
                Я прочитал(а) и согласен(на) со всеми условиями
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
