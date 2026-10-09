"use client";

import * as React from "react";

import {
  CheckCircle2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, sseUrl } from "@/lib/api";
import type { UpdateCheck, UpdateProgress } from "@/lib/types";

/** Максимальное время ожидания выхода новой версии. Одно обновление проходит через три
 *  запуска процесса (сохранение во временное хранилище → замена → новая версия), каждый
 *  занимает секунды; трёх минут достаточно, чтобы покрыть медленный диск и пересборку
 *  Docker-контейнера. */
const RESTART_TIMEOUT_MS = 180_000;

function humanSize(n?: number): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function UpdateCard() {
  const [info, setInfo] = React.useState<UpdateCheck | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [progress, setProgress] = React.useState<UpdateProgress | null>(null);
  // Отдельно от progress: после завершения сохранения во временное хранилище процесс завершается,
  // SSE рвётся, и в этот момент нужно переключиться на опрос /api/health.
  const [restarting, setRestarting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // quiet одновременно решает, обходить ли кеш backend'а: автопроверка при входе на страницу
  // использует кеш (верхняя панель только что проверяла), а ручное нажатие «Проверить обновления»
  // принудительно обращается к источнику — иначе только что опубликованную версию видно будет
  // только после истечения кеша.
  const check = React.useCallback((quiet = false) => {
    setChecking(true);
    api
      .checkUpdate(!quiet)
      .then((r) => {
        setInfo(r);
        if (!quiet) {
          if (r.error) toast.error("Ошибка проверки обновлений: " + r.error);
          else if (r.has_update) toast.success(`Найдена новая версия ${r.latest}`);
          else if (r.comparable) toast.success("Уже установлена последняя версия");
        }
      })
      .catch((e) => {
        if (!quiet) toast.error("Ошибка проверки обновлений: " + (e as Error).message);
      })
      .finally(() => setChecking(false));
  }, []);

  React.useEffect(() => {
    check(true);
  }, [check]);

  // Опрашивает /api/health до изменения номера версии.
  //
  // Критерием должно быть «версия изменилась», а не «соединение установлено»: в процессе замены
  // старая версия на мгновение снова поднимается (единственная её задача в этот раз — поставить
  // artex.new на место и сразу завершиться), и если смотреть только на доступность, успех определится неверно.
  const waitForNewVersion = React.useCallback(async (fromVersion: string) => {
    setRestarting(true);
    const deadline = Date.now() + RESTART_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(2000);
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { version?: string };
          if (j.version && j.version !== fromVersion) {
            toast.success(`Обновлено до ${j.version}, перезагружаем страницу`);
            await sleep(800);
            window.location.reload();
            return;
          }
        }
      } catch {
        // Невозможность подключиться в окне перезапуска ожидаема, опрос продолжается.
      }
    }
    setRestarting(false);
    toast.error("Истёк тайм-аут ожидания перезапуска сервиса. Проверьте логи backend'а или убедитесь, что artex запущен через start.sh / start.bat.");
  }, []);

  // Подписка на прогресс обновления. SSE не идёт через переписывание путей /api в Next (тот слой буферизует и не даёт событиям пройти).
  const openStream = React.useCallback(
    (fromVersion: string) => {
      const es = new EventSource(sseUrl("/api/update/stream"));
      es.onmessage = (ev) => {
        let p: UpdateProgress;
        try {
          p = JSON.parse(ev.data) as UpdateProgress;
        } catch {
          return;
        }
        setProgress(p);
        if (p.phase === "failed") {
          es.close();
          setBusy(false);
          toast.error("Ошибка обновления: " + (p.error || p.message));
          return;
        }
        if (p.phase === "staged") {
          es.close();
          void waitForNewVersion(fromVersion);
        }
      };
      es.onerror = () => {
        // При завершении процесса SSE обязательно рвётся. Если уже начато ожидание перезапуска,
        // это нормально — дальнейшее определение берёт на себя опрос /api/health.
        es.close();
      };
      return es;
    },
    [waitForNewVersion],
  );

  const doUpdate = () => {
    if (!info) return;
    const from = info.current;
    const ok = window.confirm(
      `Обновить до ${info.latest}?\n\n` +
        "Обновление перезапустит программу, выполняющиеся задачи будут прерваны.\n" +
        (info.mode === "docker"
          ? "\nВнимание: обновление внутри контейнера заменяет только саму программу и не обновляет " +
            "инструменты (playwright / nmap и т.п.) внутри образа; если новая версия требует новых " +
            "инструментов, используйте docker compose pull."
          : ""),
    );
    if (!ok) return;

    setBusy(true);
    setProgress({ phase: "downloading", percent: 0, message: "Подготовка…" });
    const es = openStream(from);
    api.applyUpdate().catch((e) => {
      es.close();
      setBusy(false);
      setProgress(null);
      toast.error("Не удалось запустить обновление: " + (e as Error).message);
    });
  };

  const doRollback = () => {
    if (!info) return;
    if (
      !window.confirm(
        "Откатиться на предыдущую версию?\n\nПрограмма перезапустится, выполняющиеся задачи будут прерваны.\nВнимание: структура базы данных не откатывается, старая версия может не распознать данные, записанные новой.",
      )
    )
      return;
    const from = info.current;
    setBusy(true);
    api
      .rollbackUpdate()
      .then(() => {
        toast.success("Переключено на предыдущую версию, выполняется перезапуск…");
        void waitForNewVersion(from);
      })
      .catch((e) => {
        setBusy(false);
        toast.error("Ошибка отката: " + (e as Error).message);
      });
  };

  const phase = progress?.phase;
  const showProgress = busy || restarting;
  // Реальный процент доступен только на этапе загрузки (считается по Content-Length).
  // Проверка/распаковка/ожидание перезапуска — этапы неизвестной длительности, прогресс-бар
  // заполняется полностью с пульсирующей анимацией, означающей «идёт работа, но срок неизвестен».
  const downloading = !restarting && phase === "downloading";
  const pct = downloading ? Math.max(progress?.percent ?? 0, 0) : 100;

  return (
    // Страница настроек — многоколоночная плавающая раскладка, карточка сама отвечает за
    // межстрочные отступы и запрещает разрыв между колонками (см. комментарий в page.tsx).
    <Card className="mb-4 break-inside-avoid md:mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DownloadIcon className="size-4" />
          Версия и обновления
        </CardTitle>
        <CardDescription>Проверка и установка новых версий с GitHub. Обновление перезапустит программу, выполняющиеся задачи будут прерваны.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Текущая версия</span>
          <Badge variant="secondary" className="font-mono">
            {info?.current ?? "…"}
          </Badge>
          {info && (
            <>
              <Badge variant="outline" className="font-mono">
                {info.os}/{info.arch}
              </Badge>
              <Badge variant="outline">{info.mode === "docker" ? "Docker" : "Отдельная программа"}</Badge>
            </>
          )}
          {info?.latest && (
            <>
              <span className="text-muted-foreground">Последняя версия</span>
              <Badge variant={info.has_update ? "default" : "secondary"} className="font-mono">
                {info.latest}
              </Badge>
            </>
          )}
          {info?.html_url && (
            <a
              href={info.html_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Журнал изменений <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>

        {info?.boot_notice && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            {info.boot_notice}
          </p>
        )}

        {info?.error && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            Не удалось подключиться к GitHub: {info.error}
            {"　"}Можно настроить глобальный прокси выше и повторить попытку.
          </p>
        )}

        {info && !info.comparable && info.reason && <p className="text-xs text-muted-foreground">{info.reason}</p>}

        {info?.has_update && info.asset_available === false && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            Для версии {info.latest} не предоставлен пакет для {info.os}/{info.arch} (отсутствует {info.asset}), автоматическое обновление невозможно.
          </p>
        )}

        {info?.has_update && info.asset_available !== false && (
          <p className="text-xs text-muted-foreground">
            Будет загружено <span className="font-mono">{info.asset}</span>
            {info.size ? ` (${humanSize(info.size)})` : ""}, замена произойдёт только после проверки SHA256 и
            дымового теста; при сбое текущая версия автоматически сохраняется.
          </p>
        )}

        {info && !info.has_update && info.comparable && !info.error && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2Icon className="size-3.5 text-emerald-600" />
            Уже установлена последняя версия.
          </p>
        )}

        {info?.mode === "docker" && info.has_update && (
          <p className="text-xs text-muted-foreground">
            Обновление в Docker заменяет только саму программу и не обновляет инструменты (playwright / nmap и
            т.п.) внутри образа, а
            <span className="font-mono"> docker compose up -d </span>
            при пересборке контейнера вернёт версию, встроенную в образ. Чтобы обновить вместе с образом,
            выполните
            <span className="font-mono"> docker compose pull artex &amp;&amp; docker compose up -d artex</span>.
          </p>
        )}

        {showProgress && (
          <div className="space-y-1.5">
            <Progress value={pct} className={downloading ? undefined : "animate-pulse"} />
            <p className="text-xs text-muted-foreground">
              {restarting ? "Перезапуск и применение новой версии, подождите (страница обновится автоматически)…" : progress?.message}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => check(false)} disabled={checking || busy || restarting}>
            <RefreshCwIcon className={checking ? "size-4 animate-spin" : "size-4"} />
            Проверить обновления
          </Button>
          <Button
            size="sm"
            onClick={doUpdate}
            disabled={busy || restarting || !info?.has_update || info?.asset_available === false}
          >
            <DownloadIcon className="size-4" />
            {info?.has_update ? `Обновить до ${info.latest}` : "Обновить сейчас"}
          </Button>
          {info?.has_backup && (
            <Button variant="ghost" size="sm" onClick={doRollback} disabled={busy || restarting}>
              <RotateCcwIcon className="size-4" />
              Откатиться на предыдущую версию
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Обновление в один клик требует перезапуска программы скриптом-демоном. Запускайте ARTEX через{" "}
          <span className="font-mono">start.sh</span> (в Windows —
          <span className="font-mono"> start.bat</span>); при запуске artex напрямую программа не будет
          автоматически перезапущена после завершения.
        </p>
      </CardContent>
    </Card>
  );
}
