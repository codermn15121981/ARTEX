import type { NewAssetType } from "@/lib/types";

const ASSET_TYPE_LABELS: Record<NewAssetType, string> = {
  app: "Приложение",
  endpoint: "Эндпоинт",
  ip: "IP",
  root_domain: "Корневой домен",
  service: "Сервис",
  subdomain: "Поддомен",
};

const TASK_ASSET_SOURCE_LABELS: Record<string, string> = {
  agent: "Обнаружено Agent",
  anchor: "Якорь блэкборда",
  api: "API активов",
  company: "Связь с компанией",
  legacy: "Историческая связь",
  manual: "Добавлено вручную",
  system: "Системная связь",
  task: "Инициализация задачи",
};

export function taskAssetTypeLabel(type: NewAssetType): string {
  return ASSET_TYPE_LABELS[type];
}

export function taskAssetSourceLabel(source: string): string {
  return TASK_ASSET_SOURCE_LABELS[source] ?? source;
}
