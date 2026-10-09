"use client";

import * as React from "react";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";

// Клавиша отправки/переноса строки в поле ввода диалога. Чисто фронтендная
// настройка: хранится только в localStorage, не попадает в БД и не синхронизируется
// между устройствами — при переходе на другой браузер нужно настроить заново. См.
// issue #39 — в 0.3.2 отправку с Ctrl+Enter заменили на Enter; здесь старая клавиша
// возвращена как опция.
export type ChatSendMode = "enter" | "ctrl-enter";

export const CHAT_SEND_MODE_KEY = "artex_chat_send_mode";
export const DEFAULT_CHAT_SEND_MODE: ChatSendMode = "enter";

export const CHAT_SEND_MODE_OPTIONS: { value: ChatSendMode; label: string }[] = [
  { value: "enter", label: "Enter — отправить, Shift+Enter — новая строка" },
  { value: "ctrl-enter", label: "Ctrl+Enter — отправить, Enter — новая строка" },
];

function parseMode(raw: string | null): ChatSendMode {
  return raw === "ctrl-enter" || raw === "enter" ? raw : DEFAULT_CHAT_SEND_MODE;
}

// Набор подписчиков в пределах одной вкладки. Событие storage у localStorage
// срабатывает только в «других» вкладках, поэтому после изменения настройки на этой
// же странице нужен emit, чтобы уведомить поля ввода на ней — иначе изменение
// применится только после перезагрузки.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// Возвращается строковый литерал; Object.is сравнивает по значению, так что
// useSyncExternalStore не уйдёт в цикл.
function getSnapshot(): ChatSendMode {
  return parseMode(getLocalStorageValue(CHAT_SEND_MODE_KEY));
}

// На сервере localStorage нет — сначала рендерим значение по умолчанию, после
// гидратации getSnapshot его уточнит.
function getServerSnapshot(): ChatSendMode {
  return DEFAULT_CHAT_SEND_MODE;
}

export function useChatSendMode(): ChatSendMode {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setChatSendMode(mode: ChatSendMode) {
  setLocalStorageValue(CHAT_SEND_MODE_KEY, mode);
  for (const listener of listeners) listener();
}

// shouldSubmitOnKey определяет, должно ли нажатие клавиши привести к отправке.
// isComposing / keyCode 229 означает, что метод ввода (например, для китайского
// или другого языка) ещё выбирает символ — это нужно пропускать, иначе Enter при
// выборе варианта случайно отправит сообщение. Режим enter исключает только Shift —
// поведение дословно совпадает с 0.3.2, чтобы у тех, кто не меняет настройку,
// ощущение не изменилось. Режим ctrl-enter принимает как Ctrl, так и Cmd (macOS).
export function shouldSubmitOnKey(e: React.KeyboardEvent, mode: ChatSendMode): boolean {
  if (e.key !== "Enter") return false;
  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return false;
  if (mode === "ctrl-enter") return e.ctrlKey || e.metaKey;
  return !e.shiftKey;
}
