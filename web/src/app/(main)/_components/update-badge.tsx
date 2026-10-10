"use client";

import * as React from "react";

import Link from "next/link";

import { ArrowUpCircleIcon } from "lucide-react";

import { api } from "@/lib/api";

/**
 * Индикатор «есть новая версия» в верхней панели: запрос выполняется раз при загрузке
 * страницы, при наличии обновления подсвечивается рядом с номером версии; клик ведёт
 * прямо к карточке «Версия и обновление» на странице конфигурации системы.
 *
 * У бэкенда результат запроса к GitHub кэшируется 30 минут, поэтому запрос при каждом
 * монтировании безопасен — у неавторизованного GitHub API лимит всего 60 запросов/час/IP,
 * без этого кэша открытие нескольких вкладок быстро истощит квоту, и когда реально
 * понадобится проверить обновление, запрос не пройдёт.
 *
 * Ошибка запроса всегда обрабатывается молча: верхняя панель — не место для вывода ошибок,
 * причину пользователь увидит, зайдя на страницу настроек и нажав «Проверить обновления».
 */
export function UpdateBadge() {
  const [latest, setLatest] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    api
      .checkUpdate()
      .then((r) => {
        // has_update уже включает проверку «можно ли сравнить версии», для разработческих сборок этот индикатор не загорится.
        if (alive && r.has_update && r.latest) setLatest(r.latest.replace(/^v(?=\d)/, ""));
      })
      .catch(() => {
        // Молча: ни отсутствие сети, ни лимиты GitHub не должны выводить ошибку в верхней панели.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!latest) return null;

  return (
    <Link
      href="/system/settings"
      title={`Доступна новая версия ${latest}, нажмите для перехода к обновлению`}
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
    >
      {/* Пульсирующая точка: элементов в верхней панели много, обычный текст легко не заметить, анимация делает индикатор заметным сразу. */}
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-primary-foreground" />
      </span>
      <ArrowUpCircleIcon className="size-3.5" />
      <span className="hidden sm:inline">Новая версия {latest}</span>
      <span className="sm:hidden">Новая версия</span>
    </Link>
  );
}
