"use client";

import { CheckIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { NotificationFilter } from "@/lib/types";

// asText / inputType — вспомогательные функции преобразования значений внутри этого файла
// (тесно связаны с рендером контролов), поэтому не вынесены в channel-fields.
import { type FieldDef, type FieldKind, SEVERITY_OPTIONS } from "./channel-fields";

// asText превращает произвольное значение конфигурации в строку для поля ввода.
// config приходит из JSON, значение может быть string / number / boolean / array / null —
// здесь важно только «можно ли это поместить в текстовое поле», сериализацией занимается buildConfig.
function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

// inputType сопоставляет тип поля с атрибутом type у input.
function inputType(kind: FieldKind): "text" | "password" | "number" {
  if (kind === "password") return "password";
  if (kind === "number") return "number";
  return "text";
}

// ConfigField рендерит контрол, соответствующий определению поля.
//
// Единственная тонкость здесь — обработка маскированных полей: в поле ввода
// **не показывается** само маскированное значение, только строка-подсказка «сохранено».
// Так в интерфейсе остаётся только одно правило — текст в поле означает, что пользователь
// его ввёл, а пустое поле означает пустое значение. Если поместить "__masked__:…abc123" в
// поле ввода, пользователь решит, что это текст-заглушка, который нужно удалить самому, и
// по ошибке сотрёт учётные данные.
export function ConfigField({
  def,
  value,
  isSecret,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  isSecret: boolean;
  onChange: (v: unknown) => void;
}) {
  const id = `n-cfg-${def.key}`;
  const raw = asText(value);
  // Маскированное значение, возвращённое backend'ом: вида "__masked__:…abc123", в конце — различимый фрагмент исходного значения.
  const masked = isSecret && raw.startsWith("__masked__");
  const maskedTail = masked ? (raw.split("…")[1] ?? "") : "";

  if (def.kind === "switch") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Switch checked={value === true} onCheckedChange={onChange} aria-label={def.label} />
        {def.label}
        {def.help && <span className="text-muted-foreground"> ({def.help})</span>}
      </div>
    );
  }

  if (def.kind === "select") {
    return (
      <div className="grid gap-2">
        <Label>{def.label}</Label>
        <Select value={raw || def.options?.[0]?.value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(def.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Выбор контрола по типу поля. Цепочка if вместо вложенных тернарников, потому что здесь
  // нужно различать четыре вида контролов — три уровня тернарников уже заставляют
  // останавливаться и считать скобки.
  function control() {
    if (def.kind === "textarea" || def.kind === "kv") {
      return (
        <Textarea
          id={id}
          className="font-mono"
          placeholder={def.placeholder}
          value={masked ? "" : raw}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (def.kind === "list") {
      return (
        <Input
          id={id}
          value={Array.isArray(value) ? (value as string[]).join(", ") : raw}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
        />
      );
    }
    return (
      <Input
        id={id}
        className={def.kind === "text" ? "font-mono" : ""}
        type={inputType(def.kind)}
        placeholder={def.placeholder}
        value={masked ? "" : raw}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const hint = masked ? (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <CheckIcon className="size-3" />
      Сохранено{maskedTail ? ` (окончание ${maskedTail})` : ""} · введите новое значение, чтобы заменить, очистите поле, чтобы удалить
    </p>
  ) : (
    def.help && <p className="text-muted-foreground text-xs">{def.help}</p>
  );

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{def.label}</Label>
      {control()}
      {hint}
    </div>
  );
}

// FilterSummary сжимает условия фильтра в одну строку, чтобы по карточке без разворачивания было видно, что рассылает этот канал.
export function FilterSummary({ filter }: { filter: NotificationFilter }) {
  const parts: string[] = [];
  if (filter.min_severity) {
    parts.push(SEVERITY_OPTIONS.find((o) => o.value === filter.min_severity)?.label ?? filter.min_severity);
  }
  if (filter.vulnclass_include?.length) parts.push(`включая ${filter.vulnclass_include.length} слов`);
  if (filter.vulnclass_exclude?.length) parts.push(`исключая ${filter.vulnclass_exclude.length} слов`);
  if (filter.task_ids?.length) parts.push(`${filter.task_ids.length} задач`);
  if (filter.asset_ids?.length) parts.push(`${filter.asset_ids.length} активов`);
  if (filter.on_status_change) parts.push("включая изменения статуса");
  if (parts.length === 0) {
    return <p className="text-muted-foreground text-sm">Все находки</p>;
  }
  return <p className="text-muted-foreground text-sm">{parts.join(" · ")}</p>;
}
