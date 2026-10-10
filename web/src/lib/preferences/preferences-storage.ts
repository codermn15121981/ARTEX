"use client";

import { setClientCookie } from "../cookie.client";
import { setLocalStorageValue } from "../local-storage.client";
import { PREFERENCE_PERSISTENCE, type PreferenceKey } from "./preferences-config";

export async function persistPreference(key: PreferenceKey, value: string) {
  const mode = PREFERENCE_PERSISTENCE[key];

  switch (mode) {
    case "none":
      return;

    // При статическом экспорте нет Node-сервера, server-cookie откатывается на браузерный cookie (семантика записи эквивалентна).
    case "server-cookie":
    case "client-cookie":
      setClientCookie(key, value);
      return;

    case "localStorage":
      setLocalStorageValue(key, value);
      return;

    default:
      return;
  }
}
