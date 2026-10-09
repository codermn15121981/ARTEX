"use client";

// Общий компонент настройки повторов LLM: «количество + интервал» для каждого из пяти слоёв повтора.
//
// Пять слоёв от внутреннего к внешнему: установка соединения (SDK) → пустой ответ (SDK) →
// защитное окно того же провайдера → автовыключатель ротации → повторный запуск намерения.
// Первые три слоя привязаны к эндпоинту, поэтому каждая конфигурация модели может
// переопределить глобальные значения по умолчанию; последние два — на уровне процесса,
// есть только одна глобальная версия.
//
// Все поля ввода следуют одной и той же семантике «пусто = не настроено», совпадающей с
// db.RetryRule на backend'е:
//   количество   пусто/0 = встроенное значение по умолчанию | -1 = выключить этот слой повтора | >0 = использовать это количество
//   интервал     пусто/0 = исходный экспоненциальный backoff этого слоя | >0 = использовать этот фиксированный интервал в миллисекундах

import * as React from "react";

import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { LLMRetryOverride, LLMRetryPolicy, LLMRetryRule } from "@/lib/types";

export const ZERO_RULE: LLMRetryRule = { attempts: 0, interval_ms: 0 };
export const ZERO_OVERRIDE: LLMRetryOverride = {
  connect: ZERO_RULE,
  empty: ZERO_RULE,
  stream: ZERO_RULE,
};
const ZERO_POLICY: LLMRetryPolicy = {
  ...ZERO_OVERRIDE,
  breaker: ZERO_RULE,
  intent: ZERO_RULE,
};

type LayerMeta = {
  title: string;
  /** Где происходит этот слой повтора и кто его выполняет */
  where: string;
  /** Какие ошибки попадают в этот слой — вплоть до кода статуса, чтобы не гадать */
  trigger: string;
  /** Ошибки, похожие на эти, но [не] попадающие в этот слой — чтобы настройка без эффекта не выглядела как баг */
  skips?: string;
  desc: string;
  attemptsLabel: string;
  /** Значение по умолчанию при пустом количестве, для текста-подсказки */
  defAttempts: number;
  /** Стратегия по умолчанию при пустом интервале, для текста-подсказки */
  defInterval: string;
  /** Что означает -1 в поле количества */
  offHint: string;
};

export const RETRY_LAYERS = {
  connect: {
    title: "Повтор установки соединения",
    where: "SDK · до получения 200",
    trigger:
      "Не удаётся подключиться или ещё не получен 200: ошибки сетевого уровня — сброс соединения / таймаут чтения-записи / сбой DNS и т.п., а также HTTP 408, 429, 500, 502, 503, 504.",
    skips: "Остальные коды статуса (400 / 401 / 403 / 404 / 413 / 422 и т.п.) — детерминированные отказы, повтор даст тот же результат, поэтому ошибка сразу передаётся наверх.",
    desc: "Повторно отправляет тот же самый запрос без изменений. Если поток уже начался (200 получен), разрыв посередине этим слоем уже не обрабатывается.",
    attemptsLabel: "Количество повторов",
    defAttempts: 3,
    defInterval: "0.5с→1с→2с экспоненциально (максимум 8с)",
    offHint: "-1 = не повторять ни разу, ошибка сразу передаётся наверх",
  },
  empty: {
    title: "Повтор при пустом ответе",
    where: "SDK · только для формата openai",
    trigger:
      "HTTP 200, finish_reason — обычный stop, но во всём ответе нет ни одного блока содержимого — так выглядят пустые кадры шлюза, потерянные кадры поля мышления, сбои при сэмплировании.",
    skips: "Не считается, если содержимого нет из-за обрезки по max_tokens (это решается увеличением лимита вывода, повтор просто наткнётся на то же самое).",
    desc: "Повторно отправляет весь prompt целиком, поэтому на длинном контексте это дорого — не стоит задавать большое количество попыток.",
    attemptsLabel: "Количество повторов",
    defAttempts: 2,
    defInterval: "0.5с→1с→2с экспоненциально (максимум 8с)",
    offHint: "-1 = пустой ответ отдаётся как есть, без повтора",
  },
  stream: {
    title: "Повтор в защитном окне того же провайдера",
    where: "этот проект · до того как вывод начал передаваться",
    trigger:
      "Проблема возникает уже после установления потока (получен 200): разрыв соединения посередине, overloaded у провайдера, события ошибок 429 / 5xx внутри потока — и при этом вызывающей стороне ещё не передано ни одного токена.",
    skips:
      "Не повторяется: исчерпание баланса (402 / insufficient_quota — передаётся ротации для смены конфигурации), слишком длинный контекст (413 / context length — передаётся сжатию), а также детерминированные отказы 400 / 401 / 403 / 404 / 422.",
    desc: "Повторяет тот же запрос на той же конфигурации. Поскольку вывод ещё не был передан, повтор не приводит к дублированию ответа модели или выполнения инструментов.",
    attemptsLabel: "Количество повторов",
    defAttempts: 2,
    defInterval: "0.5с→1с экспоненциально (максимум 4с)",
    offHint: "-1 = разрыв потока сразу передаётся внешнему слою — повторному запуску намерения",
  },
  breaker: {
    title: "Автовыключатель ротации",
    where: "этот проект · на уровне процесса, одна глобальная версия",
    trigger:
      "Срабатывает при накоплении временных сбоев (429, 5xx, сетевые ошибки) подряд до порога; детерминированные сбои — нехватка баланса (402), недействительный ключ (401 / 403), модель не найдена (404) — срабатывают с первого раза, без учёта порога.",
    skips: "Один успешный вызов сбрасывает счётчик, поэтому изредка сбивающаяся конфигурация не накопит сбоев до срабатывания.",
    desc: "После срабатывания конфигурация уходит в охлаждение, в период охлаждения ротация просто пропускает её. Состояние сохраняется в БД и не теряется при перезапуске.",
    attemptsLabel: "После скольких сбоев подряд срабатывает",
    defAttempts: 3,
    defInterval: "1мин→5мин→30мин по нарастающей",
    offHint: "-1 = временные сбои никогда не вызывают срабатывание (детерминированные сбои всё равно его вызывают)",
  },
  intent: {
    title: "Повторный запуск намерения",
    where: "этот проект · на уровне процесса, одна глобальная версия",
    trigger:
      "Предыдущие слои не справились: worker завершается с model_error — все внутренние повторы исчерпаны, либо разрыв произошёл уже после начала передачи вывода (в этом случае повтор небезопасен, можно только перезапустить всё целиком).",
    skips: "Исчерпание баланса уже обрабатывается сменой конфигурации в ротации и здесь не перезапускается; при приостановке / завершении задачи или переходе к её закрытию уступает немедленно, не расходуя время отступа.",
    desc: "Перезапускает всё намерение с начала. Это самый внешний слой, и один его перезапуск означает, что количества повторов внутренних слоёв умножаются ещё раз.",
    attemptsLabel: "Количество перезапусков",
    defAttempts: 2,
    defInterval: "фиксировано 3с",
    offHint: "-1 = без перезапуска, намерение сразу помечается как blocked",
  },
} satisfies Record<string, LayerMeta>;

type LayerKey = keyof typeof RETRY_LAYERS;

/** Человекочитаемое представление миллисекунд, используется только для отображения рядом с полем ввода, чтобы не считать нули. */
function humanMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Number((ms / 1000).toFixed(2))}s`;
  return `${Number((ms / 60_000).toFixed(2))}min`;
}

/** Управляемое числовое поле: пустая строка ↔ 0, промежуточные состояния ("-", "1e") остаются локально как есть, не затрагивая родителя. */
function NumField({
  id,
  value,
  onChange,
  placeholder,
  min,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  placeholder: string;
  min: number;
}) {
  const [text, setText] = React.useState(value === 0 ? "" : String(value));
  // Подхватывает, когда родитель заменяет весь набор значений (загружена политика, переключена
  // конфигурация); при собственном наборе текста сюда не попадает, потому что в этот момент
  // value уже равно результату парсинга локального текста.
  React.useEffect(() => {
    const incoming = value === 0 ? "" : String(value);
    setText((cur) => (Number(cur || 0) === value ? cur : incoming));
  }, [value]);
  return (
    <Input
      id={id}
      type="number"
      min={min}
      className="w-28 shrink-0"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? 0 : Math.trunc(n));
      }}
    />
  );
}

/** Два регулятора одного слоя повтора. idPrefix сохраняет htmlFor у label, когда компонент встречается на странице несколько раз. */
export function RetryRuleFields({
  layer,
  idPrefix,
  value,
  onChange,
  compact,
}: {
  layer: LayerKey;
  idPrefix: string;
  value: LLMRetryRule;
  onChange: (r: LLMRetryRule) => void;
  /** true = компактная версия для шторки конфигурации: без развёрнутых пояснений, только строка «какие ошибки попадают в этот слой» */
  compact?: boolean;
}) {
  const meta = RETRY_LAYERS[layer];
  const human = humanMs(value.interval_ms);
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 rounded-lg border p-3"}>
      <div className="grid gap-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <Label className="text-sm">{meta.title}</Label>
          <span className="text-muted-foreground text-xs">{meta.where}</span>
        </div>
        {/* Какие ошибки попадают в этот слой, вплоть до кода статуса — если настройка не даёт эффекта, скорее всего ошибка просто не относится к этому слою. */}
        <p className="text-muted-foreground text-xs">
          <span className="font-medium text-foreground">Срабатывает</span>: {meta.trigger}
        </p>
        {!compact && meta.skips && (
          <p className="text-muted-foreground text-xs">
            <span className="font-medium text-foreground">Не относится к этому слою</span>: {meta.skips}
          </p>
        )}
        {!compact && <p className="text-muted-foreground text-xs">{meta.desc}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-n`} className="text-muted-foreground text-xs">
            {meta.attemptsLabel}
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-n`}
            min={-1}
            value={value.attempts}
            placeholder={`По умолчанию ${meta.defAttempts}`}
            onChange={(n) => onChange({ ...value, attempts: n })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-ms`} className="text-muted-foreground text-xs">
            Интервал мс
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-ms`}
            min={0}
            value={value.interval_ms}
            placeholder="По умолчанию backoff"
            onChange={(n) => onChange({ ...value, interval_ms: n })}
          />
          <span className="text-muted-foreground text-xs">{human ? `Фиксировано ${human}` : meta.defInterval}</span>
        </div>
      </div>
      {!compact && <p className="text-muted-foreground text-xs">Пусто = использовать значение по умолчанию; {meta.offHint}.</p>}
    </div>
  );
}

/** Три переопределяемых слоя в шторке конфигурации модели (те три, что привязаны к эндпоинту). */
export function ProfileRetryFields({
  value,
  onChange,
}: {
  value: LLMRetryOverride;
  onChange: (o: LLMRetryOverride) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5">
        <Label className="text-sm">Переопределение повторов</Label>
        <p className="text-muted-foreground text-xs">
          Действует только для этой конфигурации, переопределяя глобальные значения по умолчанию из вкладки
          «Повторы и отступы». Пустое поле = следовать глобальным настройкам; -1 в количестве = выключить этот
          слой повтора; заполненный интервал заменяет экспоненциальный backoff фиксированным. Автовыключатель и
          повторный запуск намерения — на уровне процесса, настраиваются только на глобальной странице.
        </p>
      </div>
      {(["connect", "empty", "stream"] as const).map((k) => (
        <div key={k} className="border-t pt-3 first:border-t-0 first:pt-0">
          <RetryRuleFields
            compact
            layer={k}
            idPrefix="pf"
            value={value[k]}
            onChange={(r) => onChange({ ...value, [k]: r })}
          />
        </div>
      ))}
    </div>
  );
}

/** Вкладка «Повторы и отступы»: глобальные значения по умолчанию для пяти слоёв. */
export function RetryPolicyPanel() {
  const [policy, setPolicy] = React.useState<LLMRetryPolicy>(ZERO_POLICY);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.llmRetryPolicy();
      setPolicy({ ...ZERO_POLICY, ...p });
    } catch (e) {
      toast.error(`Ошибка загрузки политики повторов: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // Backend ограничивает выходящие за диапазон значения и возвращает их обратно;
      // обновляем состояние возвращённым значением, что видно — то и сохранено.
      const saved = await api.saveLLMRetryPolicy(policy);
      setPolicy({ ...ZERO_POLICY, ...saved });
      toast.success("Сохранено, применяется сразу (текущий выполняющийся вызов всё ещё использует старые параметры)");
    } catch (e) {
      toast.error(`Ошибка сохранения: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: LayerKey) => (r: LLMRetryRule) => setPolicy((p) => ({ ...p, [k]: r }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-10 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" /> Загрузка политики повторов…
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-xs leading-relaxed">
        Сбой одного вызова модели последовательно проходит через пять слоёв повтора, от внутреннего к внешнему:
        <span className="text-foreground">
          {" "}
          установка соединения → пустой ответ → защитное окно того же провайдера → автовыключатель ротации →
          повторный запуск намерения
        </span>
        . Внешний слой включается только когда исчерпан внутренний, поэтому количества{" "}
        <span className="text-foreground">перемножаются</span> — если выставить максимум на каждом слое, один
        сбой может сжечь десятки запросов. Если всё оставить пустым — это текущие значения по умолчанию,
        поведение полностью совпадает с тем, что было без этой страницы. Первые три слоя можно переопределить
        индивидуально в каждой конфигурации модели.
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(RETRY_LAYERS) as LayerKey[]).map((k) => (
          <RetryRuleFields key={k} layer={k} idPrefix="gl" value={policy[k]} onChange={set(k)} />
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Сохранить
        </Button>
        <Button variant="outline" onClick={() => setPolicy(ZERO_POLICY)} disabled={saving}>
          Сбросить всё к значениям по умолчанию
        </Button>
      </div>
    </div>
  );
}
