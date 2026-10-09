"use client";

import * as React from "react";

import {
  Loader2Icon,
  PlugZapIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  StarIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { LLMPoolMember, LLMPoolStatus, LLMProfile, LLMRetryOverride } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProfileRetryFields, RetryPolicyPanel, ZERO_OVERRIDE } from "./_components/retry";

// Переключатель мышления (thinking.type) и уровень мышления (reasoning_effort) — два
// [независимых друг от друга] поля, настраиваются по отдельности — у некоторых API нет
// поля thinking, мышление включается только параметром уровня, поэтому их нужно разделять.
// Пустая строка в хранилище = поле [не отправляется]; Radix Select не принимает пустое
// value, поэтому в UI используется сторож "none" для «не отправлять», при чтении/записи
// конвертируется в/из "" (NONE / fromStore / toStore).
const NONE = "none";
const fromStore = (v?: string) => (v ? v : NONE);
const toStore = (v: string) => (v === NONE ? "" : v);
const THINKING_TYPES: { value: string; label: string }[] = [
  { value: NONE, label: "Не отправлять (по умолчанию)" },
  { value: "disabled", label: "Выключено" },
  { value: "enabled", label: "Включено" },
];
// Какое имя поля запроса использовать для лимита вывода (имеет смысл только для формата openai). NONE ↔ "" через тот же механизм сторожевого значения.
const MAX_TOKENS_FIELDS: { value: string; label: string }[] = [
  { value: NONE, label: "max_tokens (по умолчанию)" },
  { value: "max_completion_tokens", label: "max_completion_tokens" },
];
// У двух других форматов имя поля жёстко фиксировано, выбор для них не имеет смысла — это прямо объясняется в тексте подсказки.
const MAX_TOKENS_FIELD_HINTS: Record<string, string> = {
  openai:
    "Какой ключ отправлять для лимита. max_tokens — значение по умолчанию, его понимают почти все совместимые шлюзы; официальные модели-рассуждатели OpenAI (серия o / GPT-5), наоборот, понимают только max_completion_tokens и при получении max_tokens сразу вернут ошибку unsupported_parameter.",
  anthropic: "Доступно только для формата openai. У Anthropic имя поля жёстко фиксировано как max_tokens.",
  "openai-responses": "Доступно только для формата openai. У Responses API имя поля жёстко фиксировано как max_output_tokens.",
};
const EFFORT_LEVELS: { value: string; label: string }[] = [
  { value: NONE, label: "Не отправлять (по умолчанию)" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
  { value: "max", label: "max" },
];

function cooldownText(secs: number) {
  if (secs <= 0) return "";
  if (secs < 60) return `${secs}s`;
  return `${Math.ceil(secs / 60)}min`;
}

// «Исправность» конфигурации, отображаемая на карточке. Конфигурация без ключа вообще
// не может отправить запрос — об этом нужно сказать раньше, чем о срабатывании автовыключателя;
// остальные статусы берутся из записей срабатываний в пуле (при выключенном пуле новые записи
// не создаются, и тогда «в норме» = нет известных сбоев).
type Health = { label: string; cls: string; hint?: string };
function healthOf(p: LLMProfile, m?: LLMPoolMember): Health {
  if (!p.api_key_hint) {
    return {
      label: "Key не настроен",
      cls: "border-muted-foreground/40 text-muted-foreground",
      hint: "API Key не заполнен, вызов невозможен",
    };
  }
  if (m?.state === "tripped") {
    return {
      label: m.cooldown_secs > 0 ? `Отключено · ${cooldownText(m.cooldown_secs)}` : "Отключено",
      cls: "border-destructive/50 text-destructive",
      hint: m.last_error,
    };
  }
  if (m?.state === "degraded") {
    return {
      label: `Сбой · ${m.fails} ошибок`,
      cls: "border-amber-500/50 text-amber-600 dark:text-amber-400",
      hint: m.last_error,
    };
  }
  return { label: "Норма", cls: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Шторка настройки ротации LLM
// ─────────────────────────────────────────────────────────────────────────────

function PoolSheet({
  open,
  onOpenChange,
  pool,
  onReload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pool: LLMPoolStatus | null;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  // Обратный отсчёт охлаждения — это остаток секунд, посчитанный backend'ом; опрашиваем по таймеру только когда шторка открыта и есть конфигурация не в норме, чтобы отсчёт шёл.
  React.useEffect(() => {
    if (!open || !pool?.enabled || !pool.chain.some((m) => m.state !== "ok")) return;
    const t = setInterval(() => void onReload(), 10_000);
    return () => clearInterval(t);
  }, [open, pool, onReload]);

  async function toggle(patch: { llm_pool_enabled?: boolean; llm_pool_bind_fallback?: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      await api.setSettings(patch);
      await onReload();
      if (patch.llm_pool_enabled !== undefined) {
        toast.success(patch.llm_pool_enabled ? "Ротация LLM включена" : "Ротация LLM выключена");
      } else {
        toast.success("Настройки резервирования обновлены");
      }
    } catch (e) {
      toast.error(`Ошибка настройки: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function recover(id?: string) {
    try {
      await api.resetLLMPool(id);
      await onReload();
      toast.success(id ? "Конфигурация восстановлена" : "Все конфигурации восстановлены");
    } catch (e) {
      toast.error(`Ошибка восстановления: ${(e as Error).message}`);
    }
  }

  const enabled = pool?.enabled ?? false;
  const chain = pool?.chain ?? [];
  // Участники ротации (без помеченных «не участвует в ротации»), порядок — это фактический порядок попыток на backend'е.
  const inChain = chain.filter((m) => m.active || !m.excluded);
  const tripped = chain.filter((m) => m.state === "tripped");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="px-4">
          <SheetTitle className="flex items-center gap-2">
            <ZapIcon className="size-4" /> Ротация LLM · отказоустойчивость
          </SheetTitle>
          <SheetDescription>
            При включении агенты <b>без явно указанной модели</b> при недоступности текущей конфигурации
            (нехватка баланса / недействительный Key / лимит запросов / сбой сервиса) автоматически
            переключаются на следующую конфигурацию.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="grid gap-0.5">
              <Label className="text-sm">Включить ротацию</Label>
              <p className="text-muted-foreground text-xs">По умолчанию выключено. При выключении всегда используется только активная конфигурация, при сбое — сбой.</p>
            </div>
            <Switch
              checked={enabled}
              disabled={busy}
              onCheckedChange={(v) => void toggle({ llm_pool_enabled: v })}
              aria-label="Переключатель ротации LLM"
            />
          </div>

          {enabled && (
            <>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="grid gap-0.5">
                  <Label className="text-sm">Резервирование и при указанной модели</Label>
                  <p className="text-muted-foreground text-xs">
                    По умолчанию выключено: если агент или задача указали конкретную конфигурацию, используется
                    только она, при сбое — сбой (без тихой замены на другую модель). При включении указанная
                    конфигурация при сбое также переключается на цепочку ротации ниже.
                  </p>
                </div>
                <Switch
                  checked={pool?.bind_fallback ?? false}
                  disabled={busy}
                  onCheckedChange={(v) => void toggle({ llm_pool_bind_fallback: v })}
                  aria-label="Переключатель резервирования при сбое указанной конфигурации"
                />
              </div>

              <Separator />

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Порядок ротации</Label>
                  {tripped.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => void recover()}>
                      <RotateCcwIcon /> Восстановить все
                    </Button>
                  )}
                </div>
                {inChain.length < 2 && (
                  <p className="text-muted-foreground text-xs">
                    Сейчас доступна только {inChain.length} конфигурация(й), ротация не сработает — нужно минимум
                    2 конфигурации с заполненным API Key, участвующие в ротации.
                  </p>
                )}
                {chain.map((m) => {
                  const excluded = m.excluded && !m.active;
                  const order = excluded ? null : inChain.findIndex((x) => x.profile_id === m.profile_id) + 1;
                  return (
                    <div
                      key={m.profile_id}
                      className={cn(
                        "grid gap-1 rounded-lg border p-2.5 text-sm",
                        excluded && "opacity-55",
                        m.state === "tripped" && "border-destructive/40",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="w-5 shrink-0 text-center font-mono text-muted-foreground text-xs">
                          {order ?? "—"}
                        </span>
                        <span className="font-medium">{m.name}</span>
                        {m.active && (
                          <Badge variant="outline" className="border-amber-400/50 text-amber-500">
                            Активна
                          </Badge>
                        )}
                        {excluded && <Badge variant="outline">Не участвует в ротации</Badge>}
                        <div className="ml-auto flex items-center gap-2">
                          {m.state === "tripped" && m.cooldown_secs > 0 && (
                            <span className="text-muted-foreground text-xs">Охлаждение {cooldownText(m.cooldown_secs)}</span>
                          )}
                          {m.state === "degraded" && (
                            <span className="text-muted-foreground text-xs">{m.fails} сбоев подряд</span>
                          )}
                          {m.state !== "ok" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              aria-label="Восстановить сейчас"
                              title="Восстановить сейчас: сбросить отключение, следующий вызов повторит попытку с этой конфигурацией"
                              onClick={() => void recover(m.profile_id)}
                            >
                              <RotateCcwIcon className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 pl-7 text-muted-foreground text-xs">
                        <code className="truncate font-mono">{m.model}</code>
                        {!m.active && <span>Приоритет {m.priority}</span>}
                      </div>
                      {m.last_error && (
                        <p className="truncate pl-7 font-mono text-muted-foreground text-xs" title={m.last_error}>
                          {m.last_error}
                        </p>
                      )}
                    </div>
                  );
                })}
                {chain.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
                    Пока нет конфигураций
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs leading-relaxed">
                Активная конфигурация всегда на 1-м месте, остальные — по приоритету от высокого к низкому
                (задаётся в каждой конфигурации). После сбоя конфигурация уходит в охлаждение (60с → 5мин →
                30мин), в период охлаждения пропускается, после восстановления автоматически возвращается.
                Конфигурация, чьё контекстное окно не вмещает текущий запрос, пропускается. Агенты и задачи с
                явно указанной моделью по умолчанию не участвуют в ротации.
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Шторка настройки модели (одна форма для создания и редактирования)
// ─────────────────────────────────────────────────────────────────────────────

function ProfileSheet({
  profile,
  open,
  onOpenChange,
  onSaved,
}: {
  profile: LLMProfile | null; // null = создание новой
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const isNew = !profile;
  const [name, setName] = React.useState("");
  const [format, setFormat] = React.useState<"anthropic" | "openai" | "openai-responses">("anthropic");
  const [model, setModel] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [proxy, setProxy] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [keyHint, setKeyHint] = React.useState("");
  const [rps, setRps] = React.useState("0");
  const [rpm, setRpm] = React.useState("0");
  const [cw, setCw] = React.useState("0"); // контекстное окно (тыс. токенов); 0 = по умолчанию 200K
  const [thinkingType, setThinkingType] = React.useState(NONE);
  const [effort, setEffort] = React.useState(NONE);
  const [priority, setPriority] = React.useState("0"); // позиция в ротации; чем больше, тем раньше
  const [poolExclude, setPoolExclude] = React.useState(false);
  const [streaming, setStreaming] = React.useState(true); // true = потоковый вывод (по умолчанию); false = без потока
  const [maxTokens, setMaxTokens] = React.useState("0"); // лимит вывода для одного ответа; 0 = не отправлять
  const [maxTokensField, setMaxTokensField] = React.useState(NONE); // какое имя поля использовать для лимита; NONE = max_tokens
  const [sessionHeaderKey, setSessionHeaderKey] = React.useState(""); // имя кастомного заголовка сессии; пусто = не отправлять
  const [retry, setRetry] = React.useState<LLMRetryOverride>(ZERO_OVERRIDE); // переопределение повторных попыток для этой конфигурации; все 0 = следовать глобальным настройкам
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [models, setModels] = React.useState<string[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [modelsOpen, setModelsOpen] = React.useState(false);

  // При каждом открытии форма заполняется из переданного profile (при создании — сбрасывается на
  // значения по умолчанию). Закрыть и снова открыть шторку — это чистый старт, без следов предыдущей конфигурации.
  React.useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? "");
    setFormat(profile?.format === "openai" || profile?.format === "openai-responses" ? profile.format : "anthropic");
    setModel(profile?.model ?? "");
    setBaseUrl(profile?.base_url ?? "");
    setProxy(profile?.proxy ?? "");
    setRps(String(profile?.rate_per_second ?? 0));
    setRpm(String(profile?.rate_per_minute ?? 0));
    setCw(String(profile?.context_window_k ?? 0));
    setThinkingType(fromStore(profile?.thinking_type));
    setEffort(fromStore(profile?.reasoning_effort));
    setPriority(String(profile?.priority ?? 0));
    setPoolExclude(profile?.pool_exclude ?? false);
    setStreaming(profile?.streaming ?? true);
    setMaxTokens(String(profile?.max_tokens ?? 0));
    setMaxTokensField(fromStore(profile?.max_tokens_field));
    setSessionHeaderKey(profile?.session_header_key ?? "");
    setRetry(profile?.retry ?? ZERO_OVERRIDE);
    setApiKey("");
    setKeyHint(profile?.api_key_hint ?? "");
    setModels([]);
    setModelsOpen(false);
  }, [open, profile]);

  const profileId = profile ? Number(profile.id) : undefined;

  async function loadModels() {
    if (loadingModels) return;
    setLoadingModels(true);
    setModels([]);
    try {
      const r = await api.fetchLLMModels(format, baseUrl, apiKey, proxy, profileId);
      if (r.ok && r.models && r.models.length > 0) {
        setModels(r.models);
        setModelsOpen(true);
        toast.success(`Загружено моделей: ${r.models.length}`);
      } else {
        toast.error(`Ошибка загрузки моделей: ${r.error ?? "модели не получены"}`);
      }
    } catch (e) {
      toast.error(`Ошибка при загрузке моделей: ${(e as Error).message}`);
    } finally {
      setLoadingModels(false);
    }
  }

  async function testConnection() {
    if (testing) return;
    setTesting(true);
    try {
      // Тестируем с теми же параметрами мышления, с которыми конфигурация реально будет работать —
      // так модель, не поддерживающая это поле, сломается здесь, а не посреди выполнения задачи.
      // Передаём profile id: если поле Key оставлено пустым, используется уже сохранённый ключ.
      const r = await api.testLLM(
        format,
        model,
        baseUrl,
        apiKey,
        proxy,
        toStore(thinkingType),
        toStore(effort),
        profileId,
        streaming,
        sessionHeaderKey.trim(),
      );
      // Текст ответа показывается тут же: только когда видно, что модель действительно
      // что-то сказала, можно считать проверку эквивалентной реальному запуску в диалоге.
      if (r.ok)
        toast.success(`Соединение успешно · ${r.latency_ms ?? "?"}мс · ${r.model ?? model}`, {
          description: r.reply ? `Ответ: ${r.reply}` : undefined,
        });
      else toast.error(`Ошибка соединения: ${r.error ?? "неизвестно"}`);
    } catch (e) {
      toast.error(`Ошибка теста: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!name.trim() || !model.trim()) {
      toast.error("Укажите название и модель");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const { id } = await api.saveLLMProfile({
        ...(profile ? { id: Number(profile.id) } : {}),
        name: name.trim(),
        format,
        model: model.trim(),
        base_url: baseUrl.trim(),
        proxy: proxy.trim(),
        api_key: apiKey,
        rate_per_second: Number(rps) || 0,
        rate_per_minute: Number(rpm) || 0,
        context_window_k: Number(cw) || 0,
        thinking_type: toStore(thinkingType),
        reasoning_effort: toStore(effort),
        priority: Number(priority) || 0,
        pool_exclude: poolExclude,
        streaming,
        max_tokens: Math.max(0, Number(maxTokens) || 0),
        // Переключатель имени поля имеет смысл только для openai (Chat Completions), для остальных
        // форматов всегда используется значение по умолчанию; backend тоже выполнит такую же
        // нормализацию, здесь это просто чтобы UI не отправлял противоречивые значения.
        max_tokens_field: format === "openai" ? toStore(maxTokensField) : "",
        session_header_key: sessionHeaderKey.trim(),
        retry,
      });
      if (isNew) toast.success(`Создано: ${name.trim()} (нажмите «Сделать активной» на карточке, чтобы включить)`);
      else toast.success(profile?.is_default ? "Сохранено, изменения активной конфигурации применяются сразу, без перезапуска" : "Сохранено");
      onSaved(String(id));
      onOpenChange(false);
    } catch (e) {
      toast.error(`Ошибка сохранения: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:min-w-[420px] data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="px-4">
          <SheetTitle className="flex items-center gap-2">
            {isNew ? "Новая конфигурация модели" : `Редактирование: ${profile?.name}`}
            {profile?.is_default && (
              <Badge variant="outline" className="border-amber-400/50 text-amber-500">
                Активна
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {isNew
              ? "После создания конфигурация не активируется автоматически — нажмите «Сделать активной» на карточке."
              : "После изменений нажмите «Сохранить»; сохранение активной конфигурации сразу применяется ко всем агентам."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="p-name">Название</Label>
              <Input
                id="p-name"
                placeholder="например: OpenAI продакшн"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Формат</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as "anthropic" | "openai" | "openai-responses")}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите формат" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI (Chat Completions)</SelectItem>
                  <SelectItem value="openai-responses">OpenAI (Responses API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-model">Модель</Label>
            <div className="flex gap-2">
              <Input
                id="p-model"
                className="font-mono"
                placeholder="claude-opus-4-8"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              {/* modal: содержимое этого Popover через portal попадает в <body>, вне блокировки
                  скролла Sheet — без modal список рендерится, но не скроллится. modal заставляет
                  его держать собственную верхнеуровневую блокировку скролла. */}
              <Popover open={modelsOpen} onOpenChange={setModelsOpen} modal>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    disabled={loadingModels}
                    onClick={loadModels}
                    title="Загрузить доступные модели из API"
                  >
                    {loadingModels ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                  </Button>
                </PopoverTrigger>
                {models.length > 0 && (
                  <PopoverContent className="max-h-72 w-72 gap-0 overflow-y-auto overscroll-contain p-1" align="end">
                    {models.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className="w-full shrink-0 rounded-md px-2 py-1.5 text-left font-mono text-xs hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          setModel(m);
                          setModelsOpen(false);
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </PopoverContent>
                )}
              </Popover>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-base-url">Base URL (опционально)</Label>
            <Input
              id="p-base-url"
              className="font-mono"
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-proxy">Прокси (опционально)</Label>
            <Input
              id="p-proxy"
              className="font-mono"
              placeholder="socks5://user:pass@127.0.0.1:1080 · http://127.0.0.1:8080"
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Через этот прокси идут только исходящие запросы к LLM, поддерживаются http/https/socks5, можно
              указать логин и пароль (например, socks5://user:pass@host:port; если пароль содержит специальные
              символы, их нужно URL-кодировать); пусто — прокси не используется (прямое соединение).
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-session-header">Кастомный заголовок сессии (опционально)</Label>
            <Input
              id="p-session-header"
              className="font-mono"
              placeholder="например, x-session-id (пусто = не отправлять)"
              value={sessionHeaderKey}
              onChange={(e) => setSessionHeaderKey(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              После указания имени заголовка каждый запрос будет нести этот HTTP-заголовок, значение которого
              автоматически заполняется как <b>session id текущей сессии</b> (для чата, например, conv-12, для
              воркера — например, exp3-worker-i87). Используется для шлюзов, которые делают кеширование
              промптов / sticky-роутинг по заголовку session-id: в рамках одной сессии значение стабильно на
              всех ходах, у разных сессий — разное. Если оставить пустым, заголовок не отправляется.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-api-key">API Key</Label>
            <Input
              id="p-api-key"
              type="password"
              placeholder={keyHint ? `Установлен (${keyHint}), оставьте пустым, чтобы не менять` : "sk-…"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="p-rps">Лимит в секунду</Label>
              <Input id="p-rps" type="number" min={0} value={rps} onChange={(e) => setRps(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-rpm">Лимит в минуту</Label>
              <Input id="p-rpm" type="number" min={0} value={rpm} onChange={(e) => setRpm(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-cw">Контекстное окно (K)</Label>
              <Input
                id="p-cw"
                type="number"
                min={0}
                max={1000}
                value={cw}
                onChange={(e) => setCw(e.target.value)}
                placeholder="200"
              />
            </div>
          </div>
          <p className="-mt-2 text-muted-foreground text-xs">
            Лимит 0 = без ограничения, общий для всех агентов. Контекстное окно в тысячах токенов (K), 0 = по
            умолчанию 200K, максимум 1000 (т.е. 1M); слишком большое значение приведёт к тому, что сжатие
            контекста не сработает.
          </p>

          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Label htmlFor="p-priority" className="text-sm">
                  Приоритет ротации
                </Label>
                <p className="text-muted-foreground text-xs">
                  Чем больше число, тем раньше выбирается конфигурация; активная конфигурация всегда на 1-м
                  месте независимо от этого значения. Конфигурации с одинаковым приоритетом по очереди выходят
                  первыми, что естественным образом распределяет нагрузку.
                </p>
              </div>
              <Input
                id="p-priority"
                type="number"
                className="w-24 shrink-0"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">Не участвует в ротации</Label>
                <p className="text-muted-foreground text-xs">
                  При включении конфигурация не будет использоваться как цель отказоустойчивости (но её всё ещё
                  можно явно указать для агента / задачи). Подходит для дорогих конфигураций, которые нужны
                  только конкретному агенту и не должны «сгорать» при сбоях у других.
                </p>
              </div>
              <Switch checked={poolExclude} onCheckedChange={setPoolExclude} aria-label="Не участвует в ротации" />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">Потоковый вывод · streaming</Label>
                <p className="text-muted-foreground text-xs">
                  Включено (по умолчанию) — используется потоковый SSE, с прогрессом выполнения в реальном
                  времени и счётчиком токенов на лету. Выключено — реально непоточный режим (stream:false,
                  ответ возвращается целиком за один раз) — позволяет обойти плохую реализацию SSE у некоторых
                  шлюзов (пустые кадры / потерянные кадры поля мышления), но при этом теряется прогресс в
                  реальном времени.
                </p>
              </div>
              <Switch checked={streaming} onCheckedChange={setStreaming} aria-label="Потоковый вывод" />
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Label htmlFor="p-max-tokens" className="text-sm">
                  Лимит вывода · max tokens
                </Label>
                <p className="text-muted-foreground text-xs">
                  Сколько токенов максимум генерируется за один ответ, отправляется с каждым запросом. 0 (по
                  умолчанию) = поле не отправляется, значение определяется сервером. Это не то же самое, что
                  «контекстное окно» выше: там — общая ёмкость модели, используемая только локально для
                  расчёта порога сжатия. Слишком маленькое значение может оборвать модель-рассуждатель прямо на
                  стадии размышления, не дав ни слова ответа.
                </p>
              </div>
              <Input
                id="p-max-tokens"
                type="number"
                min={0}
                className="w-28 shrink-0"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">Имя поля лимита</Label>
                <p className="text-muted-foreground text-xs">{MAX_TOKENS_FIELD_HINTS[format]}</p>
              </div>
              <Select
                value={format === "openai" ? maxTokensField : NONE}
                onValueChange={setMaxTokensField}
                disabled={format !== "openai"}
              >
                <SelectTrigger className="w-56 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_TOKENS_FIELDS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Label className="text-sm">Переключатель мышления · thinking.type</Label>
                <p className="text-muted-foreground text-xs">
                  Управляет тем, отправлять ли поле thinking. Не отправлять = без этого поля (для совместимости
                  с моделями без поддержки, например MiniMax); Выключено = отправляется disabled; Включено =
                  отправляется enabled. Не зависит от уровня ниже.
                </p>
              </div>
              <Select value={thinkingType} onValueChange={setThinkingType}>
                <SelectTrigger className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THINKING_TYPES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="grid gap-0.5">
                <Label className="text-sm">Уровень мышления · reasoning_effort</Label>
                <p className="text-muted-foreground text-xs">
                  Отдельный набор уровней (OpenAI reasoning_effort / Anthropic output_config.effort). У
                  некоторых API нет поля thinking и мышление активируется только уровнем, поэтому его можно
                  настраивать отдельно, без переключателя мышления.
                </p>
              </div>
              <Select value={effort} onValueChange={setEffort}>
                <SelectTrigger className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFORT_LEVELS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ProfileRetryFields value={retry} onChange={setRetry} />
        </div>

        <div className="flex gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
            {testing ? "Проверка…" : "Проверить соединение"}
          </Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving && <Loader2Icon className="animate-spin" />}
            {!saving && (isNew ? <PlusIcon /> : <SaveIcon />)}
            {isNew ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LLMPage() {
  const [profiles, setProfiles] = React.useState<LLMProfile[]>([]);
  const [pool, setPool] = React.useState<LLMPoolStatus | null>(null);
  const [poolOpen, setPoolOpen] = React.useState(false);
  // Открытие шторки и её содержимое хранятся раздельно: при закрытии editing не сбрасывается,
  // иначе во время анимации закрытия заголовок мигнул бы с «Редактирование X» на «Новая».
  // editing = null означает создание новой.
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LLMProfile | null>(null);
  const openEditor = React.useCallback((p: LLMProfile | null) => {
    setEditing(p);
    setEditOpen(true);
  }, []);

  const loadPool = React.useCallback(async () => {
    try {
      setPool(await api.llmPool());
    } catch {
      /* ignore */
    }
  }, []);

  const load = React.useCallback(async () => {
    try {
      setProfiles(await api.llmProfiles());
    } catch {
      /* ignore */
    }
    await loadPool();
  }, [loadPool]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Значок состояния на карточке берётся по profile id из статуса ротации.
  const health = React.useMemo(() => {
    const m = new Map<string, LLMPoolMember>();
    for (const c of pool?.chain ?? []) m.set(c.profile_id, c);
    return m;
  }, [pool]);

  async function activate(id: string, name: string) {
    try {
      await api.activateLLMProfile(id);
      toast.success(`Активирована: ${name}`);
      await load();
    } catch (e) {
      toast.error(`Ошибка активации: ${(e as Error).message}`);
    }
  }

  async function remove(p: LLMProfile) {
    if (p.is_default) {
      toast.error("Невозможно удалить текущую активную конфигурацию");
      return;
    }
    try {
      await api.deleteLLMProfile(p.id);
      toast.success(`Удалена: ${p.name}`);
      await load();
    } catch (e) {
      toast.error(`Ошибка удаления: ${(e as Error).message}`);
    }
  }

  const poolOn = pool?.enabled ?? false;

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">LLM</h1>
          <p className="text-muted-foreground text-sm">
            Общие для всех агентов настройки формата / модели / лимитов. Нажмите на карточку для редактирования,
            звёздочка — текущая активная конфигурация.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPoolOpen(true)}>
            <ZapIcon /> Настройка ротации
            {poolOn && (
              <Badge variant="outline" className="ml-1 border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                Включено
              </Badge>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openEditor(null)}>
            <PlusIcon /> Создать
          </Button>
        </div>
      </div>

      <Tabs defaultValue="profiles" className="flex-1">
        <TabsList>
          <TabsTrigger value="profiles">Конфигурации модели</TabsTrigger>
          <TabsTrigger value="retry">Повторы и отступы</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((p) => {
              const h = healthOf(p, health.get(p.id));
              return (
                // biome-ignore lint/a11y/useSemanticElements: Карточка содержит собственные кнопки действий, нативный <button> вызвал бы вложенность кнопок (недопустимый HTML)
                <Card
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditor(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEditor(p);
                    }
                  }}
                  className={cn(
                    "cursor-pointer gap-0 py-4 outline-none transition-colors hover:border-foreground/30",
                    p.is_default && "border-amber-400/50 bg-amber-400/5",
                  )}
                >
                  <CardContent className="grid gap-2 px-4">
                    <div className="flex items-start gap-2">
                      <StarIcon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          p.is_default ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-sm">{p.name}</span>
                          <Badge variant="outline" className="uppercase">
                            {p.format}
                          </Badge>
                          <Badge variant="outline" className={cn("ml-auto", h.cls)} title={h.hint}>
                            {h.label}
                          </Badge>
                        </div>
                        <code className="mt-1 block truncate font-mono text-muted-foreground text-xs">{p.model}</code>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-muted-foreground text-xs">
                      {p.api_key_hint && <span>{p.api_key_hint}</span>}
                      <span>
                        {p.rate_per_second}/s · {p.rate_per_minute}/min
                      </span>
                      {p.proxy && <span className="truncate">Прокси {p.proxy}</span>}
                      {p.reasoning_effort && (
                        <span>Мышление {p.reasoning_effort === "off" ? "выкл" : p.reasoning_effort}</span>
                      )}
                      {/* Два поля, связанные с ротацией, имеют смысл только когда ротация включена, при выключенной — не занимают место */}
                      {poolOn &&
                        !p.is_default &&
                        (p.pool_exclude ? <span>Не участвует в ротации</span> : <span>Приоритет {p.priority ?? 0}</span>)}
                    </div>

                    <div className="mt-1 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={p.is_default}
                        onClick={(e) => {
                          e.stopPropagation();
                          void activate(p.id, p.name);
                        }}
                      >
                        {p.is_default ? "Активна" : "Сделать активной"}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Удалить конфигурацию"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(p);
                        }}
                      >
                        <Trash2Icon className="text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {profiles.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
                Пока нет конфигураций модели — нажмите «Создать» в правом верхнем углу, чтобы создать первую.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="retry" className="mt-4">
          <RetryPolicyPanel />
        </TabsContent>
      </Tabs>

      <ProfileSheet profile={editing} open={editOpen} onOpenChange={setEditOpen} onSaved={() => void load()} />
      <PoolSheet open={poolOpen} onOpenChange={setPoolOpen} pool={pool} onReload={loadPool} />
    </div>
  );
}
