"use client";

import * as React from "react";

import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  CopyIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { TablePagination } from "@/components/table-pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type {
  InterceptApprovalFilter,
  InterceptApprovalRow,
  InterceptAudit,
  InterceptDetail,
  InterceptPending,
  InterceptReviewInput,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function source(row: InterceptApprovalRow) {
  if (row.decision_source) return row.decision_source;
  if (row.rule_id) return "rule";
  // "[模型]" — литеральный префикс, который пишет backend (intercept/intercept.go) в reason
  // для решений модели; не переводится, пока backend не переведён.
  return row.reason?.startsWith("[模型]") ? "model" : "unknown";
}

function originLabel(row: InterceptApprovalRow) {
  if (row.task_id) return row.task_id;
  if (row.conversation_id) return `Диалог #${row.conversation_id}`;
  return "—";
}

function ApprovalOrigin({ row, detail = false }: { row: InterceptApprovalRow; detail?: boolean }) {
  const [locating, setLocating] = React.useState(false);
  const label = detail && row.task_id ? `Задача ${row.task_id}` : originLabel(row);
  const query = new URLSearchParams({ approval: String(row.id) });
  let href: string | undefined;
  if (row.conversation_id) {
    query.set("c", String(row.conversation_id));
    href = `/chat?${query}`;
  } else if (row.task_id) {
    query.set("id", row.task_id);
    href = `/function/tasks/detail?${query}`;
  }
  return href ? (
    <a
      href={href}
      className="text-primary underline-offset-4 hover:underline"
      aria-label={`Перейти к источнику согласования #${row.id}: ${label}`}
      aria-busy={locating}
      onClick={async (e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (locating) return;
        setLocating(true);
        try {
          await api.interceptExecution(row.id, row.conversation_id ?? undefined);
          window.location.assign(href);
        } catch (error) {
          toast.error((error as Error).message || "Не удалось найти соответствующее выполнение");
          setLocating(false);
        }
      }}
    >
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { pending: "На согласовании", allowed: "Разрешено", denied: "Отклонено", timeout: "Истёк срок" };
  let variant: "default" | "destructive" | "secondary" | "outline" = "outline";
  if (status === "allowed") variant = "default";
  if (status === "denied") variant = "destructive";
  if (status === "pending") variant = "secondary";
  return <Badge variant={variant}>{labels[status] ?? status}</Badge>;
}

function MatchCell({ row, showReason = true }: { row: InterceptApprovalRow; showReason?: boolean }) {
  // "[模型]" здесь и ниже — тот же протокольный префикс, что и в source(); оставлен как есть.
  const reason = row.reason?.replace(/^\[模型\]\s*/, "");
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {source(row) === "model" ? (
        <Badge variant="outline">
          <BotIcon />
          Решение модели
        </Badge>
      ) : (
        <span className="truncate">{row.rule_name || "Правило не записано или удалено"}</span>
      )}
      {showReason ? (
        <p className="truncate text-muted-foreground text-xs" title={reason}>
          {reason || "Причина не записана"}
        </p>
      ) : null}
    </div>
  );
}

function CodeBlock({ label, text, truncated = false }: { label: string; text: string; truncated?: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать, выделите текст вручную");
    }
  }
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs">{label}</h3>
        {text ? (
          <Button variant="ghost" size="icon-xs" aria-label={`Скопировать ${label}`} onClick={() => void copy()}>
            <CopyIcon />
          </Button>
        ) : null}
      </div>
      <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-mono text-xs leading-6 [overflow-wrap:anywhere]">
        {text || "Не записано"}
      </pre>
      {truncated ? <p className="text-muted-foreground text-xs">Содержимое обрезано, выше показан сохранённый фрагмент.</p> : null}
    </section>
  );
}

const contextLabels: Record<string, string> = {
  user: "Сообщение пользователя",
  assistant: "Сообщение агента",
  text: "Сообщение агента",
  tool_use: "Запрос инструмента",
  tool_result: "Вывод инструмента",
};

const actionLabels: Record<string, string> = { allow: "Разрешить", ask: "Передать человеку", deny: "Отклонить" };
const executionLabels: Record<InterceptAudit["execution_status"], string> = {
  not_started: "Ещё не выполнялось",
  not_executed: "Не выполнено",
  awaiting_result: "Разрешено, ожидание результата выполнения",
  succeeded: "Выполнено успешно",
  failed: "Выполнение не удалось",
  unknown: "Результат выполнения неизвестен",
};

function ModelReviewContext({ input }: { input: InterceptReviewInput }) {
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Контекст проверки моделью">
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">Контекст проверки моделью</h3>
        <p className="text-muted-foreground text-xs">
          Ниже — снимок данных, которые фактически были отправлены модели-проверяющей в этот раз. Контекст
          приведён только для понимания текущего действия, решение принимается по политике проверки.
          {input.version < 4 ? " Эта запись использует вход старой версии, сохранено содержимое, которое было отправлено на тот момент." : null}
        </p>
      </div>
      <CodeBlock
        label="Проверяемый вызов"
        text={JSON.stringify({ tool_name: input.tool_name, arguments: input.arguments }, null, 2)}
      />
      {input.version >= 2 ? (
        input.background ? (
          <div className="flex min-w-0 flex-col gap-2">
            <CodeBlock
              label={input.background.source === "user_message" ? "Контекст · сообщение пользователя" : "Контекст · сводка намерения воркера (старая версия)"}
              text={input.background.text}
              truncated={input.background.truncated}
            />
            <p className="text-muted-foreground text-xs">
              {input.background.source === "user_message"
                ? "Взято из текущего сообщения пользователя."
                : "Это сводка намерения воркера, отправлявшаяся в старой версии; в новой версии проверки воркера это содержимое больше не отправляется."}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">В этой проверке контекстное сообщение не передавалось.</p>
        )
      ) : (
        <>
          {input.turn_input ? (
            <CodeBlock label="Вход текущего хода (старая версия)" text={input.turn_input} truncated={input.background_truncated} />
          ) : null}
          {input.task ? (
            <>
              <CodeBlock label="Описание задачи (старая версия)" text={input.task.description} truncated={input.task.truncated} />
              <CodeBlock label="Цель задачи (старая версия)" text={input.task.goal} truncated={input.task.truncated} />
              <CodeBlock label="Ограничения действий задачи (старая версия)" text={JSON.stringify(input.task.constraints, null, 2)} />
            </>
          ) : null}
          {input.worker_intent ? (
            <CodeBlock label="Намерение воркера (старая версия)" text={input.worker_intent} truncated={input.background_truncated} />
          ) : null}
        </>
      )}
      {input.working_directory ? <CodeBlock label="Рабочий каталог" text={input.working_directory} /> : null}
      {input.version >= 3 ? (
        <p className="text-muted-foreground text-xs">В этой проверке история вызовов или результаты выполнения не отправлялись.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <h4 className="font-medium text-muted-foreground text-xs">История вызовов, переданная модели на тот момент (старая версия)</h4>
          {input.history?.length ? (
            input.history.map((entry) => (
              <div key={entry.tool_use_id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
                <p className="break-words font-medium text-xs">
                  {entry.tool} · {entry.status === "succeeded" ? "успешно" : "неудачно (возможны частичные побочные эффекты)"}
                </p>
                <CodeBlock label="Параметры исторического вызова" text={entry.arguments_preview} truncated={entry.truncated} />
                <CodeBlock label="Результат исторического выполнения" text={entry.result} truncated={entry.truncated} />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">В этой проверке не было предоставлено сопоставимой истории выполнения инструментов.</p>
          )}
          {input.history_truncated ? (
            <p className="text-muted-foreground text-xs">История хранится в ограниченном окне, часть содержимого обрезана.</p>
          ) : null}
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="self-start">
            <ChevronDownIcon data-icon="inline-start" />
            Показать полный JSON входных данных проверки моделью
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <CodeBlock label="Входные данные проверки моделью" text={JSON.stringify(input, null, 2)} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

type Decide = (id: number, decision: "allowed" | "denied") => Promise<void>;

function DecisionActions({ row, busy, decide }: { row: InterceptApprovalRow; busy: boolean; decide: Decide }) {
  if (row.status !== "pending") return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => void decide(row.id, "allowed")}>
        <CheckIcon data-icon="inline-start" />
        Разрешить
      </Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => void decide(row.id, "denied")}>
        <XIcon data-icon="inline-start" />
        Отклонить
      </Button>
    </div>
  );
}

export function ApprovalDetail({
  row,
  busy,
  decide,
  revision,
  readOnly = false,
  defaultExpanded = false,
  onResolved,
}: {
  row: InterceptApprovalRow;
  busy: boolean;
  decide: Decide;
  revision: number;
  readOnly?: boolean;
  defaultExpanded?: boolean;
  onResolved?: (status: "allowed" | "denied" | "timeout") => void;
}) {
  const [detail, setDetail] = React.useState<InterceptDetail | null>(null);
  const [error, setError] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  const [more, setMore] = React.useState(defaultExpanded);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Status, refresh and retry invalidate details without closing the panel.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const next = await api.interceptDetail(row.id);
        if (cancelled) return;
        setDetail(next);
        setError("");
        if (next.status !== "pending") onResolved?.(next.status);
        if (next.status === "pending" || next.audit?.execution_status === "awaiting_result")
          timer = setTimeout(() => void load(), 5000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Не удалось загрузить детали");
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [row.id, row.status, revision, retry, onResolved]);

  // Row updates are authoritative until the lazy detail has caught up.
  const current = detail?.status === row.status ? detail : row;
  const audit = detail?.audit;
  let execution = audit ? executionLabels[audit.execution_status] : "Не записано";
  if (row.status === "pending") execution = "Ещё не выполнялось";
  if (audit && audit.correlation !== "exact" && audit.effective_action === "allow") execution = "Результат выполнения не связан";
  const command = typeof row.tool_input?.command === "string" ? row.tool_input.command : undefined;
  let initialLabel = source(row) === "model" ? "Первичное решение модели" : "Первичное решение правила";
  if (audit?.model_fallback) initialLabel = "Резервный переход после сбоя модели";

  return (
    <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <div className="grid min-w-0 gap-5 rounded-xl border bg-muted/20 p-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock
            label={`${current.agent_name || current.conv_agent_key || "Agent"} · Запрос инструмента`}
            text={JSON.stringify(row.tool_input ?? {}, null, 2)}
          />
          {command ? (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  <ChevronDownIcon data-icon="inline-start" />
                  Показать содержимое команды
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <CodeBlock label="Содержимое команды" text={command} />
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Результат выполнения: <span className="text-foreground">{detail ? execution : "Загрузка…"}</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:pl-5">
          <h3 className="font-medium text-muted-foreground text-xs">
            {current.status === "pending" ? "Статус проверки" : "Решение по согласованию"}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={current.status} />
            <MatchCell row={current} showReason={false} />
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
            {current.reason?.replace(/^\[模型\]\s*/, "") || "Причина согласования не записана"}
          </p>
          {audit?.decision_reason ? <p className="text-sm">{audit.decision_reason}</p> : null}
          {audit?.effective_action ? <p className="text-sm">Итоговое действие: {actionLabels[audit.effective_action]}</p> : null}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Источник</dt>
            <dd className="break-words">
              <ApprovalOrigin row={current} detail />
            </dd>
            <dt className="text-muted-foreground">Время запроса</dt>
            <dd>{fmtTime(row.created_at)}</dd>
            <dt className="text-muted-foreground">Время решения</dt>
            <dd>{fmtTime(current.decided_at)}</dd>
            {audit?.rule_name ? (
              <>
                <dt className="text-muted-foreground">Снимок правила</dt>
                <dd>{audit.rule_name}</dd>
              </>
            ) : null}
            {audit?.profile_id ? (
              <>
                <dt className="text-muted-foreground">Конфигурация модели для согласования</dt>
                <dd>#{audit.profile_id}</dd>
              </>
            ) : null}
          </dl>
          {!readOnly ? <DecisionActions row={current} busy={busy} decide={decide} /> : null}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-2">
              <span>Не удалось загрузить детали: {error}</span>
              <Button variant="outline" size="sm" onClick={() => setRetry((v) => v + 1)}>
                Повторить загрузку
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {!detail && !error ? <Skeleton className="h-8 w-60" /> : null}
      {detail && !audit ? (
        <Alert>
          <AlertDescription>Для этой записи не сохранён снимок деталей согласования, невозможно восстановить тогдашний контекст, первичное решение модели и вывод выполнения.</AlertDescription>
        </Alert>
      ) : null}
      {audit ? (
        <Collapsible open={more} onOpenChange={setMore}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              <ChevronDownIcon data-icon="inline-start" className={cn(more && "rotate-180")} />
              {more ? "Скрыть контекст" : "Показать контекст и результат выполнения"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <div className="flex min-w-0 flex-col gap-5">
              {audit.model_input ? (
                <ModelReviewContext input={audit.model_input} />
              ) : (
                <Alert>
                  <AlertDescription>
                    {audit.model_input_digest
                      ? "В этой исторической записи сохранён только отпечаток входных данных проверки, исходный текст не сохранён, восстановить тогдашний контекст, отправленный модели, невозможно. Это не означает, что во время проверки контекста не было; для новых решений модели снимок входных данных сохраняется."
                      : "В этой записи не сохранены входные данные проверки моделью — возможно, решение было принято правилом напрямую, произошла ошибка до вызова модели, либо запись создана в старой версии."}
                  </AlertDescription>
                </Alert>
              )}
              {audit.user_message || audit.context?.length ? (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <ChevronDownIcon data-icon="inline-start" />
                      {audit.model_input && audit.model_input.version >= 3
                        ? "Показать фрагмент аудита диалога (не отправлялся модели)"
                        : "Показать фрагмент аудита диалога"}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="flex min-w-0 flex-col gap-3">
                      {audit.user_message ? (
                        <CodeBlock
                          label="Вход текущего хода диалога (фрагмент аудита)"
                          text={audit.user_message}
                          truncated={audit.user_truncated}
                        />
                      ) : null}
                      <section className="flex min-w-0 flex-col gap-3">
                        <h3 className="font-medium text-muted-foreground text-xs">Видимый контекст диалога</h3>
                        <p className="text-muted-foreground text-xs">
                          Фрагмент записи диалога, сохранённый {fmtTime(audit.captured_at)}. Фактически
                          использованное моделью содержимое см. в разделе «Входные данные проверки моделью».
                        </p>
                        {audit.context_truncated ? (
                          <p className="text-muted-foreground text-xs">Сохранён только недавний контекст, часть содержимого обрезана.</p>
                        ) : null}
                        {audit.context?.length ? (
                          audit.context.map((entry, index) => (
                            <CodeBlock
                              key={`${entry.kind}-${entry.tool_use_id || index}`}
                              label={`${contextLabels[entry.kind] ?? entry.kind}${entry.tool ? ` · ${entry.tool}` : ""}${entry.is_error ? " · Ошибка" : ""}`}
                              text={entry.text}
                              truncated={entry.truncated}
                            />
                          ))
                        ) : (
                          <p className="text-muted-foreground text-sm">Связанный контекст не записан</p>
                        )}
                      </section>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              <CodeBlock
                label={`${initialLabel}: ${actionLabels[audit.initial_action] ?? audit.initial_action}`}
                text={audit.initial_reason.replace(/^\[模型\]\s*/, "")}
              />
              <CodeBlock
                label="Вывод выполнения"
                text={audit.output ?? (audit.execution_status === "not_executed" ? "Инструмент не выполнялся." : "Пока нет вывода выполнения")}
                truncated={audit.output_truncated}
              />
              {audit.correlation !== "exact" ? (
                <Alert>
                  <AlertDescription>
                    {audit.correlation === "ambiguous"
                      ? "Существуют параллельные вызовы с одинаковыми параметрами, однозначно связать вызов инструмента не удаётся; эта запись не показывает предполагаемый результат выполнения."
                      : "ID вызова инструмента для однозначной привязки не записан."}
                  </AlertDescription>
                </Alert>
              ) : null}
              <dl className="grid gap-2 text-muted-foreground text-xs [overflow-wrap:anywhere]">
                <div>ID вызова инструмента: {audit.tool_use_id || "не записано"}</div>
                <div>SHA-256 сводки параметров: {audit.input_digest}</div>
                <div>SHA-256 отпечатка конфигурации проверки: {audit.config_digest || "не записано"}</div>
                {audit.model_input_digest ? <div>SHA-256 входных данных проверки моделью: {audit.model_input_digest}</div> : null}
                {audit.execution_ended_at ? <div>Время записи результата: {fmtTime(audit.execution_ended_at)}</div> : null}
              </dl>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

// Hidden cells do not occupy table columns. Keep the detail span in sync so
// expansion cannot create empty columns and leave a gap in the selected row.
const approvalBreakpoints = ["(min-width: 40rem)", "(min-width: 48rem)", "(min-width: 64rem)", "(min-width: 80rem)"];
function subscribeColumns(onChange: () => void) {
  const queries = approvalBreakpoints.map((query) => window.matchMedia(query));
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}
function visibleColumnCount() {
  const matches = approvalBreakpoints.map((query) => window.matchMedia(query).matches);
  return 3 + Number(matches[0]) + Number(matches[1]) + 2 * Number(matches[2]) + 2 * Number(matches[3]);
}
function serverColumnCount() {
  return 9;
}

function ApprovalTable({
  rows,
  busy,
  decide,
  revision,
  label,
}: {
  rows: InterceptApprovalRow[];
  busy: boolean;
  decide: Decide;
  revision: number;
  label: string;
}) {
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set());
  const columns = React.useSyncExternalStore(subscribeColumns, visibleColumnCount, serverColumnCount);
  const prefix = React.useId();
  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <Table className="table-fixed" aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Развернуть детали</span>
          </TableHead>
          <TableHead className="hidden w-14 sm:table-cell">#</TableHead>
          <TableHead className="w-28">Инструмент</TableHead>
          <TableHead className="hidden md:table-cell">Источник</TableHead>
          <TableHead className="hidden lg:table-cell">Совпавшее правило</TableHead>
          <TableHead className="hidden xl:table-cell">Параметры</TableHead>
          <TableHead className="w-24">Статус</TableHead>
          <TableHead className="hidden w-36 lg:table-cell">Время запроса</TableHead>
          <TableHead className="hidden w-36 xl:table-cell">Время решения</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const open = expanded.has(row.id);
          const panelID = `${prefix}-${row.id}`;
          return (
            <React.Fragment key={row.id}>
              <TableRow
                data-state={open ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => toggle(row.id)}
              >
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${open ? "Свернуть" : "Развернуть"} согласование #${row.id}`}
                    aria-expanded={open}
                    aria-controls={open ? panelID : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(row.id);
                    }}
                  >
                    {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </Button>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{row.id}</TableCell>
                <TableCell>
                  <code className="block truncate text-xs">{row.tool_name}</code>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-col gap-1">
                    <span className="truncate" title={originLabel(row)}>
                      <ApprovalOrigin row={row} />
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {row.agent_name || row.conv_agent_key}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <MatchCell row={row} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <code className="block truncate text-muted-foreground text-xs">{JSON.stringify(row.tool_input)}</code>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground text-xs lg:table-cell">
                  {fmtTime(row.created_at)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground text-xs xl:table-cell">
                  {fmtTime(row.decided_at)}
                </TableCell>
              </TableRow>
              {open ? (
                <TableRow className="hover:bg-transparent has-aria-expanded:bg-transparent">
                  <TableCell colSpan={columns} className="whitespace-normal p-0">
                    <section id={panelID} aria-label={`Детали согласования #${row.id}`}>
                      <ApprovalDetail row={row} busy={busy} decide={decide} revision={revision} />
                    </section>
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ApprovalRecords({ taskId }: { taskId?: string }) {
  const [rows, setRows] = React.useState<InterceptApprovalRow[]>([]);
  const [pendingRows, setPendingRows] = React.useState<InterceptPending[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [filter, setFilter] = React.useState<InterceptApprovalFilter>({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pendingError, setPendingError] = React.useState("");
  const [deciding, setDeciding] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const request = React.useRef(0);
  const decisionLock = React.useRef(false);
  const filterID = React.useId();
  const filtered = Boolean(filter.status || filter.decision_source);

  // A task can stay mounted while the user switches between task details.
  // Reset the cursor so the new scope always starts at its newest records.
  // biome-ignore lint/correctness/useExhaustiveDependencies: taskId intentionally resets pagination when scope changes.
  React.useEffect(() => {
    setPage(1);
  }, [taskId]);

  const load = React.useCallback(
    async (manual = false) => {
      const id = ++request.current;
      if (manual) setRefreshing(true);
      try {
        // The approval queue is independent of the current history page and its
        // filter. Older requests must remain actionable even when newer decisions
        // fill the page or a filter would hide them.
        const [history, pending] = await Promise.allSettled([
          taskId ? api.interceptTaskPage(taskId, page, pageSize, filter) : api.interceptHistoryPage(page, pageSize, filter),
          api.interceptPending(),
        ]);
        if (id !== request.current) return;
        if (history.status === "fulfilled") {
          setRows(history.value.items);
          setTotal(history.value.total);
          setError("");
        } else {
          setError((history.reason as Error).message || "Ошибка загрузки");
        }
        if (pending.status === "fulfilled") {
          setPendingRows(pending.value);
          setPendingError("");
        } else {
          setPendingError((pending.reason as Error).message || "Ошибка загрузки");
        }
        if (manual) setRevision((v) => v + 1);
      } catch (e) {
        if (id === request.current) setError((e as Error).message || "Ошибка загрузки");
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [taskId, page, pageSize, filter],
  );
  const latestLoad = React.useRef(load);
  latestLoad.current = load;

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      request.current++;
      clearInterval(timer);
    };
  }, [load]);

  const changePageSize = (next: number) => {
    setPageSize(next);
    setPage(1);
  };

  const changeFilter = (next: InterceptApprovalFilter) => {
    // An in-flight response for the old filter must not repopulate the table.
    request.current++;
    setFilter(next);
    setPage(1);
    setRows([]);
    setTotal(0);
    setError("");
    setLoading(true);
  };

  const decide: Decide = async (id, decision) => {
    if (decisionLock.current) return;
    decisionLock.current = true;
    setDeciding(true);
    try {
      await api.interceptDecide(id, decision);
      // Invalidate a list request started before this decision.
      request.current++;
      // Optimistically drop the decided item from the independent pending queue
      // for instant feedback; the re-fetch below reconciles with server truth.
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, status: decision, decided_at: new Date().toISOString() } : row)),
      );
      setPendingRows((prev) => prev.filter((row) => row.id !== id));
      setRevision((v) => v + 1);
      toast.success(decision === "allowed" ? "Выполнение разрешено" : "Выполнение отклонено");
      // Re-fetch counts and rows: a decided item may no longer match the filter.
      await latestLoad.current(true);
    } catch (e) {
      toast.error((e as Error).message);
      await latestLoad.current(true);
    } finally {
      decisionLock.current = false;
      setDeciding(false);
    }
  };

  const historyById = new Map(rows.map((row) => [row.id, row]));
  const pending: InterceptApprovalRow[] = pendingRows
    .filter((row) => !taskId || row.task_id === taskId)
    .map((row) => ({
      conv_title: "",
      conv_agent_key: "",
      rule_name: row.rule_id ? `Правило #${row.rule_id}` : "",
      ...historyById.get(row.id),
      ...row,
    }));
  const title = taskId ? "Согласования перехвата" : "Записи согласований";
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardListIcon className="size-5 text-muted-foreground" />
          <h1 className="font-semibold text-xl">{title}</h1>
          {pending.length ? <Badge variant="secondary">{pending.length} на согласовании</Badge> : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}>
          <RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
          Обновить
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">Разверните запись, чтобы увидеть запрос инструмента, решение по согласованию, а также тогдашний контекст и результат выполнения.</p>
      <FieldGroup className="flex-row flex-wrap items-end gap-3" aria-label="Фильтр записей согласований">
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-status`}>Статус согласования</FieldLabel>
          <Select
            value={filter.status ?? "all"}
            onValueChange={(value) =>
              changeFilter({
                ...filter,
                status: value === "all" ? undefined : (value as InterceptApprovalFilter["status"]),
              })
            }
          >
            <SelectTrigger id={`${filterID}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="denied">Отклонено</SelectItem>
                <SelectItem value="pending">На согласовании</SelectItem>
                <SelectItem value="allowed">Разрешено</SelectItem>
                <SelectItem value="timeout">Истёк срок</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor={`${filterID}-source`}>Источник решения</FieldLabel>
          <Select
            value={filter.decision_source ?? "all"}
            onValueChange={(value) =>
              changeFilter({
                ...filter,
                decision_source: value === "all" ? undefined : (value as InterceptApprovalFilter["decision_source"]),
              })
            }
          >
            <SelectTrigger id={`${filterID}-source`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Все источники</SelectItem>
                <SelectItem value="model">Решение модели</SelectItem>
                <SelectItem value="rule">Решение правила</SelectItem>
                <SelectItem value="unknown">Источник неизвестен</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => changeFilter({})}>
            Сбросить фильтр
          </Button>
        ) : null}
      </FieldGroup>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Не удалось загрузить записи: {error}. Нажмите «Обновить», чтобы повторить.</AlertDescription>
        </Alert>
      ) : null}
      {pendingError ? (
        <Alert variant="destructive">
          <AlertDescription>Не удалось загрузить записи на согласовании: {pendingError}. Нажмите «Обновить», чтобы повторить.</AlertDescription>
        </Alert>
      ) : null}
      {pending.length ? (
        <section className="overflow-hidden rounded-xl border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3 font-medium text-sm">
            <ShieldAlertIcon className="size-4" />
            Ожидают обработки ({pending.length})<span className="text-muted-foreground text-xs">После развёртывания — разрешить или отклонить</span>
          </div>
          <ApprovalTable rows={pending} busy={deciding} decide={decide} revision={revision} label="Ожидающие согласования" />
        </section>
      ) : null}
      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3 font-medium text-sm">
          {filtered ? "Результаты фильтра" : "Все записи"} ({total})
        </div>
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}
        {!loading && !rows.length && !error ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardListIcon />
              </EmptyMedia>
              <EmptyTitle>{filtered ? "Нет записей согласования, подходящих под фильтр" : "Пока нет записей согласования"}</EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "Измените статус согласования или источник решения, либо сбросьте фильтр, чтобы увидеть все записи."
                  : "Как только правило или модель примут решение по согласованию, записи появятся здесь."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {rows.length ? (
          <ApprovalTable rows={rows} busy={deciding} decide={decide} revision={revision} label="Список записей согласований" />
        ) : null}
        {!loading && !error ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
            pageSizeOptions={[10, 20, 50]}
          />
        ) : null}
      </section>
    </div>
  );
}
