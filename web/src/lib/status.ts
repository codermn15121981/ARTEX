// Centralised status → color/label semantics, reused across the whole app.
// Спецификация §8.3: у intent / coverage / задач / severity единая согласованная цветовая схема.

export type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "rose" | "violet" | "slate";

export const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  red: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  // rose используется для «критической» серьёзности — сплошной, с высоким
  // акцентом, визуально заметно сильнее мягкой красной обводки «высокой».
  rose: "bg-rose-600 text-white border-rose-600 dark:bg-rose-600 dark:text-white",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

export const toneDot: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  rose: "bg-white",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
};

interface StatusMeta {
  label: string;
  tone: Tone;
}

const intent: Record<string, StatusMeta> = {
  open: { label: "Не взято", tone: "slate" },
  running: { label: "Выполняется", tone: "blue" },
  paused: { label: "Приостановлено", tone: "amber" },
  done: { label: "Завершено", tone: "green" },
  // blocked = попытки повтора после сбоя модели/API/сети исчерпаны, это
  // намерение по сути не было реально исследовано (это не блокировка со
  // стороны цели).
  blocked: { label: "Ошибка выполнения", tone: "red" },
  // exhausted = выполнение было прервано по достижении бюджета шагов/времени,
  // записана только часть результата (это не означает, что направление
  // полностью исследовано).
  exhausted: { label: "Бюджет исчерпан", tone: "violet" },
  // stopped = историческое состояние мягкого удаления (сохраняется как
  // исторические данные).
  stopped: { label: "Остановлено", tone: "slate" },
  // deleted = пользователь «удалил» это намерение (узел и цепочка
  // происхождения сохраняются, причина удаления — в поле delete_reason).
  deleted: { label: "Удалено", tone: "slate" },
};

const task: Record<string, StatusMeta> = {
  created: { label: "Создана", tone: "slate" },
  queued: { label: "В очереди", tone: "amber" },
  running: { label: "Выполняется", tone: "blue" },
  paused: { label: "Приостановлена", tone: "amber" },
  done: { label: "Завершена", tone: "green" },
  failed: { label: "Ошибка", tone: "red" },
  timeout: { label: "Истекло время", tone: "amber" },
};

const severity: Record<string, StatusMeta> = {
  critical: { label: "Критическая", tone: "rose" },
  high: { label: "Высокая", tone: "red" },
  medium: { label: "Средняя", tone: "amber" },
  low: { label: "Низкая", tone: "slate" },
};

const finding: Record<string, StatusMeta> = {
  pending: { label: "Ожидает обработки", tone: "amber" },
  in_progress: { label: "В обработке", tone: "blue" },
  confirmed: { label: "Подтверждено", tone: "red" },
  resolved: { label: "Обработано", tone: "green" },
  fixed: { label: "Исправлено", tone: "green" },
  false_positive: { label: "Ложное срабатывание", tone: "slate" },
  ignored: { label: "Игнорируется", tone: "neutral" },
  duplicate: { label: "Дубликат", tone: "neutral" },
  risk_accepted: { label: "Риск принят", tone: "violet" },
};

const engine: Record<string, StatusMeta> = {
  exploring: { label: "Исследование", tone: "blue" },
  paused: { label: "Приостановлен", tone: "amber" },
  stalled: { label: "Застрял", tone: "red" },
  idle: { label: "Простой", tone: "neutral" },
};

const goal: Record<string, StatusMeta> = {
  open: { label: "В процессе", tone: "blue" },
  met: { label: "Достигнута", tone: "green" },
  abandoned: { label: "Отказано", tone: "slate" },
};

const audit: Record<string, StatusMeta> = {
  allow: { label: "Разрешено", tone: "green" },
  block: { label: "Заблокировано", tone: "red" },
};

const node: Record<string, StatusMeta> = {
  observed: { label: "Наблюдалось", tone: "slate" },
  confirmed: { label: "Подтверждено", tone: "green" },
  tombstoned: { label: "Архивировано", tone: "neutral" },
};

// Статусы доставки уведомлений. sending использует blue, а не amber: это не
// «проблема», а «взято в обработку и отправляется» — важно отличать от
// ожидания в pending.
const delivery: Record<string, StatusMeta> = {
  pending: { label: "Ожидает отправки", tone: "amber" },
  sending: { label: "Отправляется", tone: "blue" },
  sent: { label: "Доставлено", tone: "green" },
  failed: { label: "Ошибка", tone: "red" },
  skipped: { label: "Пропущено", tone: "neutral" },
};

const maps = {
  intent,
  task,
  severity,
  finding,
  engine,
  goal,
  audit,
  node,
  delivery,
} as const;

export type StatusDomain = keyof typeof maps;

export function statusMeta(domain: StatusDomain, key: string): StatusMeta {
  return maps[domain][key] ?? { label: key, tone: "neutral" };
}
