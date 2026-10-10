// Таблица полей каналов и утилиты разбора значений конфигурации.
//
// Вынесено из страницы в отдельный файл, потому что это **данные**, а не представление:
// здесь описано, какие поля есть у каждого канала, какой контрол использовать для
// каждого, и как текст формы превращается в значение конфигурации (JSON) и обратно.
// Благодаря отдельному файлу добавление нового канала требует правок только здесь,
// саму страницу менять не нужно.
// Отображаемое имя и описание типа канала. Находится на фронтенде, потому что влияет
// только на текст, backend об этом знать не нужно.
export const KIND_LABEL: Record<string, string> = {
  dingtalk: "DingTalk",
  feishu: "Feishu (Lark)",
  wecom: "WeCom (WeChat Work)",
  webhook: "Обычный Webhook",
  telegram: "Telegram",
  email: "Email",
};

// Определения полей конфигурации для каждого канала.
//
// Здесь намеренно хранится отдельная таблица полей на фронтенде, а не схема, отдаваемая
// backend'ом: backend отвечает только за Validate (обязательность/формат), а UI нужна
// раскладка и тип контрола — это разные задачи. Единственная точка связи — secret_keys:
// какие поля рендерить как поле пароля определяет backend, потому что только сама
// реализация канала знает, какие значения являются учётными данными (у WeCom вообще
// весь Webhook — это учётные данные, а у DingTalk — лишь один из secret-параметров).
// Если при добавлении канала здесь не хватает записи, форма просто окажется пустой,
// без молчаливой ошибки (на это укажет hasFields ниже).
export type FieldKind = "text" | "password" | "number" | "select" | "textarea" | "switch" | "kv" | "list";
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
}
export const CHANNEL_FIELDS: Record<string, FieldDef[]> = {
  dingtalk: [
    {
      key: "webhook",
      label: "Адрес Webhook",
      kind: "text",
      placeholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
    },
    {
      key: "secret",
      label: "Ключ подписи",
      kind: "password",
      help: "Заполните, если в настройках безопасности бота выбрано «подпись»; если выбрано «ключевые слова» или безопасность не настроена — оставьте пустым",
    },
  ],
  feishu: [
    {
      key: "webhook",
      label: "Адрес Webhook",
      kind: "text",
      placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
    },
    { key: "secret", label: "Ключ проверки подписи", kind: "password", help: "Заполните, если у бота включена «проверка подписи», иначе оставьте пустым" },
  ],
  wecom: [
    {
      key: "webhook",
      label: "Адрес Webhook",
      kind: "text",
      placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
    },
  ],
  webhook: [
    { key: "url", label: "Целевой URL", kind: "text", placeholder: "https://your-endpoint.example.com/hook" },
    {
      key: "method",
      label: "Метод запроса",
      kind: "select",
      options: [
        { value: "POST", label: "POST (с телом запроса)" },
        { value: "PUT", label: "PUT (с телом запроса)" },
        { value: "PATCH", label: "PATCH (с телом запроса)" },
        { value: "GET", label: "GET (без тела запроса)" },
      ],
    },
    { key: "headers", label: "Пользовательские заголовки", kind: "kv", help: "По одному KEY=VALUE на строку, например Authorization=Bearer xxx" },
    {
      key: "body_template",
      label: "Шаблон тела запроса",
      kind: "textarea",
      help:
        "Оставьте пустым, чтобы использовать встроенный шаблон по умолчанию. Переменные: {{.Title}} {{.Batch}} {{.Count}} {{.HomeURL}} {{.SentAt}}, " +
        "а также .Name/.VulnClass/.Severity/.Summary/.Assets/.DetailURL/.StatusLabel внутри range .Items. " +
        "Для вставки строк используйте {{json .Xxx}}, а не {{.Xxx}} — иначе кавычки в заголовке сломают JSON.",
    },
  ],
  telegram: [
    { key: "bot_token", label: "Bot Token", kind: "password", placeholder: "123456:ABC-DEF..." },
    { key: "chat_id", label: "Chat ID", kind: "text", placeholder: "-1001234567890" },
    {
      key: "base_url",
      label: "Адрес API",
      kind: "text",
      placeholder: "https://api.telegram.org",
      help: "Оставьте пустым для официального адреса; заполните при использовании собственного реверс-прокси Bot API",
    },
  ],
  email: [
    { key: "host", label: "SMTP-сервер", kind: "text", placeholder: "smtp.example.com" },
    {
      key: "port",
      label: "Порт",
      kind: "number",
      placeholder: "587",
      help: "587 — через STARTTLS; для 465 включите «неявный TLS»",
    },
    { key: "username", label: "Логин", kind: "text" },
    { key: "password", label: "Пароль / код авторизации", kind: "password" },
    { key: "from", label: "Отправитель", kind: "text", placeholder: "artex@example.com" },
    { key: "to", label: "Получатели", kind: "list", help: "Несколько адресов через запятую" },
    { key: "tls", label: "Неявный TLS", kind: "switch", help: "Включите для порта 465; для 587 оставьте выключенным (STARTTLS включится автоматически)" },
  ],
};

export const SEVERITY_OPTIONS = [
  { value: "", label: "Без ограничений" },
  { value: "low", label: "Низкая и выше" },
  { value: "medium", label: "Средняя и выше" },
  { value: "high", label: "Высокая и выше" },
  { value: "critical", label: "Только критическая" },
];

export type ChannelForm = {
  name: string;
  kind: string;
  mode: "realtime" | "digest";
  enabled: boolean;
  ratePerMin: string;
  config: Record<string, unknown>;
  minSeverity: string;
  includeText: string;
  excludeText: string;
  taskIDsText: string;
  assetIDsText: string;
  onStatusChange: boolean;
};

export const emptyForm = (kind: string): ChannelForm => ({
  name: "",
  kind,
  mode: "realtime",
  enabled: true,
  ratePerMin: "",
  config: {},
  minSeverity: "",
  includeText: "",
  excludeText: "",
  taskIDsText: "",
  assetIDsText: "",
  onStatusChange: false,
});

// parseKV разбирает текстовое поле вида «по одной паре KEY=VALUE на строку».
export function parseKV(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
// parseIDs разбирает список id, разделённый запятыми/пробелами.
export function parseIDs(text: string): number[] {
  return text
    .split(/[\s,，]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}
// parseKeywords разбирает список ключевых слов, разделённых строками/запятыми (название типа уязвимости может содержать пробелы, поэтому разделитель — строка или запятая).
export function parseKeywords(text: string): string[] {
  return text
    .split(/[\n,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
