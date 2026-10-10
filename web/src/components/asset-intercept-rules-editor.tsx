"use client";

import * as React from "react";

import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { AssetInterceptKind, AssetInterceptRuleInput } from "@/lib/types";

// Используем NativeSelect (нативный <select>), а не shadcn Select: этот редактор применяется
// внутри Sheet-панели, а всплывающее меню shadcn Select портится в body и клик снаружи ложно
// срабатывает как «клик вне панели» для самой панели; у нативного select такой проблемы нет.
export const ASSET_INTERCEPT_KIND_OPTIONS: {
  value: AssetInterceptKind;
  label: string;
  placeholder: string;
}[] = [
  { value: "exact_domain", label: "Домен (точное совпадение)", placeholder: "example.gov.cn" },
  { value: "exact_ip", label: "IP (точное совпадение)", placeholder: "203.0.113.10" },
  { value: "exact_url", label: "URL (точное совпадение)", placeholder: "https://example.com/login" },
  { value: "fuzzy_domain", label: "Домен (нечёткое совпадение)", placeholder: ".gov.cn" },
  { value: "fuzzy_ip", label: "IP (нечёткое совпадение)", placeholder: "203.0.113." },
  { value: "fuzzy_url", label: "URL (нечёткое совпадение)", placeholder: "/admin" },
  { value: "cidr", label: "Подсеть CIDR", placeholder: "192.168.0.0/16" },
];

// AssetInterceptRulesEditor — контролируемая многострочная область редактирования правил
// перехвата/разрешения (block/allow + тип + содержимое для сопоставления + примечание),
// без собственного сохранения — родительский компонент решает, когда отправлять данные.
export function AssetInterceptRulesEditor({
  value,
  onChange,
}: {
  value: AssetInterceptRuleInput[];
  onChange: (v: AssetInterceptRuleInput[]) => void;
}) {
  function update(i: number, patch: Partial<AssetInterceptRuleInput>) {
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...value, { action: "block", kind: "fuzzy_domain", pattern: "", note: "", enabled: true }]);
  }
  return (
    <div className="grid gap-2">
      {value.map((r, i) => {
        const ph = ASSET_INTERCEPT_KIND_OPTIONS.find((o) => o.value === r.kind)?.placeholder ?? "";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: у строки нет стабильного id, управление по индексу допустимо
          <div key={i} className="flex items-center gap-2">
            <NativeSelect
              size="sm"
              className="w-[84px] shrink-0"
              value={r.action}
              onChange={(e) => update(i, { action: e.target.value as "block" | "allow" })}
            >
              <NativeSelectOption value="block">Перехват</NativeSelectOption>
              <NativeSelectOption value="allow">Разрешено</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="w-[120px] shrink-0"
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as AssetInterceptKind })}
            >
              {ASSET_INTERCEPT_KIND_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              className="flex-1"
              placeholder={ph}
              value={r.pattern}
              onChange={(e) => update(i, { pattern: e.target.value })}
            />
            <Input
              className="w-[120px] shrink-0"
              placeholder="Примечание (необязательно)"
              value={r.note}
              onChange={(e) => update(i, { note: e.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive hover:text-destructive size-8 shrink-0"
              onClick={() => remove(i)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={add}>
        <PlusIcon className="size-4" /> Добавить правило
      </Button>
    </div>
  );
}
