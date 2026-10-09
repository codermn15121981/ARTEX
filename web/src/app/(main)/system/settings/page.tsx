"use client";

import * as React from "react";

import { CpuIcon, FlaskConicalIcon, KeyboardIcon, RadioTowerIcon, SearchIcon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { CHAT_SEND_MODE_OPTIONS, type ChatSendMode, setChatSendMode, useChatSendMode } from "@/lib/chat-send-mode";
import type { Settings } from "@/lib/types";

import { UpdateCard } from "./_components/update-card";

export default function SystemSettingsPage() {
  const [trafficCapture, setTrafficCapture] = React.useState(false);
  const [agentTrafficBinding, setAgentTrafficBinding] = React.useState(false);
  const [webSearch, setWebSearch] = React.useState(false);
  const [backend, setBackend] = React.useState("ddgs");
  const [braveKeySet, setBraveKeySet] = React.useState(false);
  const [braveKeyInput, setBraveKeyInput] = React.useState("");
  const [tavilyKeySet, setTavilyKeySet] = React.useState(false);
  const [tavilyKeyInput, setTavilyKeyInput] = React.useState("");
  const [savingTavilyKey, setSavingTavilyKey] = React.useState(false);
  const [proxyInput, setProxyInput] = React.useState("");
  const [savingProxy, setSavingProxy] = React.useState(false);
  const [globalProxyInput, setGlobalProxyInput] = React.useState("");
  const [savingGlobalProxy, setSavingGlobalProxy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);
  const [pyInterp, setPyInterp] = React.useState("");
  const [workers, setWorkers] = React.useState("3");
  const [savingWorkers, setSavingWorkers] = React.useState(false);
  // Область внедрения операционных ограничений (по умолчанию включены обе).
  const [injectPlanner, setInjectPlanner] = React.useState(true);
  const [injectWorker, setInjectWorker] = React.useState(true);
  // Экспериментальная функция: сжатие контекста noa (по умолчанию выключено).
  const [noaCompaction, setNoaCompaction] = React.useState(false);
  // Чисто фронтенд-настройка: не идёт через /api/settings, читается и пишется прямо в localStorage.
  const sendMode = useChatSendMode();

  const apply = React.useCallback((s: Settings) => {
    setTrafficCapture(!!s.traffic_capture);
    setAgentTrafficBinding(!!s.agent_traffic_binding);
    setWebSearch(!!s.web_search_enabled);
    setBackend(s.web_search_backend || "ddgs");
    setBraveKeySet(!!s.brave_key_set);
    setTavilyKeySet(!!s.tavily_key_set);
    setProxyInput(s.web_search_proxy ?? "");
    setGlobalProxyInput(s.global_proxy ?? "");
    setPyInterp(s.python_interpreter ?? "");
    setWorkers(String(s.workers ?? 3));
    setInjectPlanner(s.constraints_inject_planner !== false);
    setInjectWorker(s.constraints_inject_worker !== false);
    setNoaCompaction(!!s.noa_compaction);
  }, []);

  const saveWorkers = () => {
    const n = Number(workers);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error("Количество параллельных воркеров должно быть целым числом больше 0");
      return;
    }
    setSavingWorkers(true);
    api
      .setSettings({ workers: n })
      .then((s) => {
        apply(s);
        toast.success("Количество параллельных рабочих агентов сохранено (применяется к задачам, запущенным после этого)");
      })
      .catch((e) => toast.error("Ошибка сохранения: " + (e as Error).message))
      .finally(() => setSavingWorkers(false));
  };

  const savePython = () => {
    setSaving(true);
    api
      .setSettings({ python_interpreter: pyInterp.trim() })
      .then((s) => {
        apply(s);
        toast.success("Конфигурация интерпретатора Python сохранена");
      })
      .catch((e) => toast.error("Ошибка сохранения: " + (e as Error).message))
      .finally(() => setSaving(false));
  };
  const detectPython = () => {
    setSaving(true);
    api
      .detectPython()
      .then((r) => setPyInterp(r.python_interpreter))
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  React.useEffect(() => {
    api
      .settings()
      .then(apply)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [apply]);

  const toggleTraffic = (v: boolean) => {
    setTrafficCapture(v); // optimistic
    setSaving(true);
    api
      .setSettings({ traffic_capture: v })
      .then(apply)
      .catch(() => setTrafficCapture(!v)) // revert on failure
      .finally(() => setSaving(false));
  };

  const toggleInjectPlanner = (v: boolean) => {
    setInjectPlanner(v); // optimistic
    api
      .setSettings({ constraints_inject_planner: v })
      .then(apply)
      .catch(() => setInjectPlanner(!v)); // revert on failure
  };

  const toggleAgentTrafficBinding = (v: boolean) => {
    setAgentTrafficBinding(v);
    setSaving(true);
    api
      .setSettings({ agent_traffic_binding: v })
      .then((s) => {
        apply(s);
        toast.success(v ? "Автоматическая привязка трафика к агентам включена" : "Автоматическая привязка трафика к агентам выключена");
      })
      .catch((e) => {
        setAgentTrafficBinding(!v);
        toast.error(`Ошибка сохранения: ${(e as Error).message}`);
      })
      .finally(() => setSaving(false));
  };

  const toggleInjectWorker = (v: boolean) => {
    setInjectWorker(v); // optimistic
    api
      .setSettings({ constraints_inject_worker: v })
      .then(apply)
      .catch(() => setInjectWorker(!v)); // revert on failure
  };

  const toggleNoaCompaction = (v: boolean) => {
    setNoaCompaction(v); // optimistic
    api
      .setSettings({ noa_compaction: v })
      .then((s) => {
        apply(s);
        toast.success(v ? "Сжатие контекста noa включено (применяется к запускам, начатым после этого)" : "Сжатие контекста noa выключено (восстановлено встроенное сжатие)");
      })
      .catch((e) => {
        setNoaCompaction(!v); // revert on failure
        toast.error(`Ошибка сохранения: ${(e as Error).message}`);
      });
  };

  // Persist a web-search patch (enable and/or backend). Optimistic with refetch.
  const saveWebSearch = (patch: Partial<Settings>) => {
    setSaving(true);
    api
      .setSettings(patch)
      .then((s) => {
        apply(s);
        toast.success("Конфигурация веб-поиска сохранена");
      })
      .catch((e) => {
        toast.error("Ошибка сохранения: " + (e as Error).message);
        api
          .settings()
          .then(apply)
          .catch(() => undefined);
      })
      .finally(() => setSaving(false));
  };

  const saveBraveKey = () => {
    setSavingKey(true);
    api
      .setSettings({ brave_search_api_key: braveKeyInput })
      .then((s) => {
        apply(s);
        setBraveKeyInput("");
        toast.success("Brave API Key сохранён");
      })
      .catch((e) => toast.error("Ошибка сохранения: " + (e as Error).message))
      .finally(() => setSavingKey(false));
  };

  const saveTavilyKey = () => {
    setSavingTavilyKey(true);
    api
      .setSettings({ tavily_search_api_key: tavilyKeyInput })
      .then((s) => {
        apply(s);
        setTavilyKeyInput("");
        toast.success("Tavily API Key сохранён");
      })
      .catch((e) => toast.error("Ошибка сохранения: " + (e as Error).message))
      .finally(() => setSavingTavilyKey(false));
  };

  const saveProxy = () => {
    setSavingProxy(true);
    api
      .setSettings({ web_search_proxy: proxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(proxyInput.trim() ? "Выходной прокси сохранён" : "Выходной прокси очищен (прямое соединение)");
      })
      .catch((e) => toast.error("Ошибка сохранения: " + (e as Error).message))
      .finally(() => setSavingProxy(false));
  };

  const saveGlobalProxy = () => {
    setSavingGlobalProxy(true);
    api
      .setSettings({ global_proxy: globalProxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(globalProxyInput.trim() ? "Глобальный прокси сохранён" : "Глобальный прокси очищен (прямое соединение)");
      })
      .catch((e) => toast.error("Ошибка сохранения: " + (e as Error).message))
      .finally(() => setSavingGlobalProxy(false));
  };

  // Run a real "test" search ("test") against the CURRENT form values (backend +
  // proxy + entered key), falling back to saved values server-side. Toasts result.
  const runTest = () => {
    setTesting(true);
    api
      .testWebSearch({
        web_search_backend: backend,
        web_search_proxy: proxyInput.trim(),
        brave_search_api_key: braveKeyInput,
        tavily_search_api_key: tavilyKeyInput,
      })
      .then((r) => {
        if (r.ok) toast.success(`Тест поиска успешен · ${r.backend} вернул ${r.count} результатов`);
        else toast.error("Тест поиска не удался: " + (r.error || "неизвестная ошибка"));
      })
      .catch((e) => toast.error("Тест поиска не удался: " + (e as Error).message))
      .finally(() => setTesting(false));
  };

  // brave-free selected but no key stored and none being entered → tool stays off.
  const braveNeedsKey = webSearch && backend === "brave-free" && !braveKeySet;

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Системная конфигурация</h1>
        <p className="text-muted-foreground text-sm">Глобальные переключатели времени выполнения</p>
      </div>

      {/* Многоколоночная раскладка, а не grid: карточка веб-поиска в разы выше остальных,
          и её высота меняется в зависимости от выбранного backend'а (поля ввода ключей для
          brave/tavily рендерятся условно). grid растянул бы все карточки по высоте самой
          высокой, оставив рядом большие пустые области, а многоколоночная раскладка сама
          балансирует заполнение по высоте содержимого. Отступы между карточками через mb,
          а не gap — в многоколоночной раскладке column-gap управляет только расстоянием
          между колонками, а межстрочный отступ должен давать сам дочерний элемент. */}
      <div className="columns-1 gap-4 md:gap-6 lg:columns-2">
        <UpdateCard />

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              Захват трафика
            </CardTitle>
            <CardDescription>
              При включении весь HTTP-трафик всех агентов полностью сохраняется в БД через
              записывающий прокси, а агентам добавляются инструменты traffic_search / traffic_get и
              конфигурация прокси (в промпт добавляется описание прокси).
              <br />
              При выключении (по умолчанию) трафик не записывается: агенты <b>не получают</b>{" "}
              конфигурацию прокси и инструменты трафика, в промпте тоже <b>нет</b> упоминаний прокси.
              Переключение сразу пересобирает агентов.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="traffic-capture" className="text-sm font-normal text-muted-foreground">
              {trafficCapture ? "Включено · трафик записывается, прокси внедряется" : "Выключено · не записывается, прокси не внедряется"}
            </Label>
            <Switch
              id="traffic-capture"
              checked={trafficCapture}
              disabled={!loaded || saving}
              onCheckedChange={toggleTraffic}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              Автоматическая привязка трафика к агенту
            </CardTitle>
            <CardDescription id="agent-traffic-binding-description">
              По умолчанию выключено. При включении агент-отчётчик, срабатывающий при внесении находки в
              базу, сверяется с уже имеющимися HTTP-запросами/ответами и привязывает соответствующий
              трафик перед составлением отчёта. <b>Просмотр пакетов и дополнительные вызовы инструментов
              увеличивают расход токенов.</b>
              <br />
              Для TCP, при отсутствии захвата пакетов или совпавшего трафика отчёт всё равно формируется
              нормально. Этот переключатель не влияет на захват трафика, ручную привязку и просмотр уже
              сохранённых доказательств. Применяется к следующему запуску агента; после выключения новая
              автоматическая привязка отклоняется немедленно.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="agent-traffic-binding" className="text-sm font-normal text-muted-foreground">
              {agentTrafficBinding ? "Включено · увеличивает расход токенов" : "Выключено · можно продолжать привязывать вручную"}
            </Label>
            <Switch
              id="agent-traffic-binding"
              aria-describedby="agent-traffic-binding-description"
              checked={agentTrafficBinding}
              disabled={!loaded || saving}
              onCheckedChange={toggleAgentTrafficBinding}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              Глобальный прокси
            </CardTitle>
            <CardDescription>
              <b>Целевой трафик</b> всех агентов выходит в сеть через этот прокси (скрывает исходный IP /
              идёт через промежуточный узел). Поддерживаются <b>http / https / socks5</b>, можно указать
              аутентификацию <code>user:pass</code>. Пусто = прямое соединение.
              <br />
              При включённом <b>захвате трафика</b> он работает как <b>вышестоящий</b> для записывающего
              прокси (трафик всё равно полностью сохраняется в БД, затем выходит через этот прокси); при
              выключенном захвате внедряется напрямую в исходящие bash / WebFetch агента. Независим от
              прокси веб-поиска и прокси LLM.
              <br />
              <b>Подсказка</b>: при <b>выключенном захвате</b> socks5 зависит от поддержки{" "}
              <code>ALL_PROXY</code> конкретным инструментом командной строки (curl поддерживает, некоторые
              инструменты могут игнорировать); если в основном используется socks5, рекомендуется включить
              захват трафика — в этом случае соединение устанавливает сам MITM, инструменты ничего не
              замечают, и это работает стабильно.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="global-proxy" className="text-sm font-normal text-muted-foreground">
              Адрес прокси
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="global-proxy"
                autoComplete="off"
                placeholder="socks5://user:pass@host:1080 или http://host:port (пусто = прямое соединение)"
                value={globalProxyInput}
                disabled={!loaded || savingGlobalProxy}
                onChange={(e) => setGlobalProxyInput(e.target.value)}
              />
              <Button type="button" onClick={saveGlobalProxy} disabled={!loaded || savingGlobalProxy}>
                Сохранить
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {globalProxyInput.trim() ? "Настроен · весь целевой трафик выходит через этот прокси" : "Не настроен · целевой трафик идёт напрямую"}
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlertIcon className="size-4" />
              Внедрение операционных ограничений
            </CardTitle>
            <CardDescription>
              При включении <b>операционные ограничения</b> задачи (пункты allow/deny, заданные в разделе
              «Операционные ограничения» на странице задачи) добавляются в системный промпт
              соответствующего агента, задавая границы разведки (например, «тестировать только текущий
              порт», «запретить брутфорс»).
              <br />
              Можно по отдельности управлять внедрением для <b>планировщика (planner)</b> и{" "}
              <b>исполнителя (worker)</b>; по умолчанию включены оба. Переключение применяется мгновенно
              (считывается на следующем ходе), пересборка агента не требуется. После выключения этот агент
              больше не видит ограничений.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="inject-planner" className="text-sm font-normal text-muted-foreground">
                Внедрять в планировщика (planner){injectPlanner ? " · Включено" : " · Выключено"}
              </Label>
              <Switch
                id="inject-planner"
                checked={injectPlanner}
                disabled={!loaded}
                onCheckedChange={toggleInjectPlanner}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="inject-worker" className="text-sm font-normal text-muted-foreground">
                Внедрять в исполнителя (worker){injectWorker ? " · Включено" : " · Выключено"}
              </Label>
              <Switch
                id="inject-worker"
                checked={injectWorker}
                disabled={!loaded}
                onCheckedChange={toggleInjectWorker}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConicalIcon className="size-4" />
              Экспериментальные функции
            </CardTitle>
            <CardDescription>
              Механизмы, которые ещё проверяются, по умолчанию выключены. Могут изменить поведение агента
              или повлиять на стабильность — включайте, понимая последствия.
              <br />
              <b>Сжатие контекста noa</b>: модель сама сжимает длинную историю диалога (norma v0.4.0). При
              включении все четыре типа агентов платформы (<b>планировщик / исполнитель / главный агент /
              диалог</b>) передают управление контекстом noa вместо встроенного сжатия; исходный текст
              перед сжатием архивируется в рабочий каталог задачи для последующего просмотра. Переключение
              применяется мгновенно (к запускам, начатым после этого), пересборка агента не требуется; после
              выключения встроенное сжатие восстанавливается немедленно.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="noa-compaction" className="text-sm font-normal text-muted-foreground">
              Сжатие контекста noa{noaCompaction ? " · Включено" : " · Выключено"}
            </Label>
            <Switch
              id="noa-compaction"
              checked={noaCompaction}
              disabled={!loaded}
              onCheckedChange={toggleNoaCompaction}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SearchIcon className="size-4" />
              Веб-поиск
            </CardTitle>
            <CardDescription>
              Это <b>общий переключатель + настройка источника</b> для веб-поиска. При включении в{" "}
              <b>конфигурации каждого агента</b> отдельно можно включить <b>web_search</b> (возвращает только
              заголовок/ссылку/аннотацию, без извлечения текста страницы — за это отвечает WebFetch). Веб-поиск{" "}
              <b>не идёт</b> через записывающий прокси, независим от захвата трафика.
              <br />
              Источник можно выбрать: <b>DuckDuckGo (ddgs)</b> (без ключа), <b>Brave (бесплатная версия)</b>{" "}
              (требуется Brave API Key), <b>Tavily</b> (требуется Tavily API Key) или <b>DeepSeek</b>{" "}
              (использует текущую конфигурацию LLM). При выключенном общем переключателе переключатель
              веб-поиска у каждого агента недоступен.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="web-search" className="text-sm font-normal text-muted-foreground">
                {webSearch ? "Общий переключатель включён · можно включать отдельно в конфигурации каждого агента" : "Выключено · агенты не могут использовать веб-поиск"}
              </Label>
              <Switch
                id="web-search"
                checked={webSearch}
                disabled={!loaded || saving}
                onCheckedChange={(v) => {
                  setWebSearch(v); // optimistic
                  saveWebSearch({ web_search_enabled: v });
                }}
              />
            </div>

            {webSearch && (
              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm font-normal text-muted-foreground">Источник поиска</Label>
                <Select
                  value={backend}
                  disabled={!loaded || saving}
                  onValueChange={(v) => {
                    setBackend(v); // optimistic
                    saveWebSearch({ web_search_backend: v });
                  }}
                >
                  <SelectTrigger className="w-48 shrink-0">
                    <SelectValue placeholder="Выберите источник" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ddgs">DuckDuckGo (ddgs · бесплатно, без ключа)</SelectItem>
                    <SelectItem value="brave-free">Brave (бесплатная версия · требуется ключ)</SelectItem>
                    <SelectItem value="tavily">Tavily (требуется ключ)</SelectItem>
                    <SelectItem value="deepseek">DeepSeek (официальный)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {webSearch && backend === "deepseek" && (
              <div className="border-border/60 bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
                <p className="text-sm font-medium">Официальный веб-поиск DeepSeek</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Этот источник напрямую использует <b>текущую активную конфигурацию LLM</b>. Поэтому он{" "}
                  <b>поддерживает только официальные модели DeepSeek</b>, и эта конфигурация{" "}
                  <b>обязательно должна использовать протокол anthropic</b> — конечные точки DeepSeek по
                  протоколу OpenAI не поддерживают поиск на стороне сервера. При смене конфигурации LLM этот
                  источник может перестать работать.
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Поиск выполняется <b>на стороне сервера DeepSeek</b>: каждый поиск — это дополнительный вызов
                  модели (расходует токены), поисковый запрос <b>не идёт</b> через выходной прокси выше и{" "}
                  <b>не учитывается</b> в записи трафика; в результате возвращаются <b>только заголовок и
                  ссылка</b> (без аннотации) — для получения текста страницы нужен WebFetch.
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Соответствие перечисленным условиям подтверждаете вы сами, система их не проверяет; можно
                  проверить на практике кнопкой «Тест поиска» ниже.
                </p>
              </div>
            )}

            {webSearch && backend === "brave-free" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="brave-key" className="text-sm font-normal text-muted-foreground">
                  Brave Search API Key
                  {braveKeySet && <span className="ml-2 text-xs text-emerald-500">Настроен</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="brave-key"
                    type="password"
                    autoComplete="off"
                    placeholder={braveKeySet ? "Настроен (оставьте пустым, чтобы не менять)" : "Введите Brave API Key"}
                    value={braveKeyInput}
                    disabled={!loaded || savingKey}
                    onChange={(e) => setBraveKeyInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={saveBraveKey}
                    disabled={!loaded || savingKey || braveKeyInput.trim() === ""}
                  >
                    Сохранить
                  </Button>
                </div>
                {braveNeedsKey && (
                  <p className="text-xs text-amber-500">
                    Выбран Brave, но ключ ещё не настроен — инструмент поиска не включится, пока ключ не сохранён.
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Квота бесплатной версии — около 2 000 запросов/месяц. Получить ключ на https://brave.com/search/api/.
                </p>
              </div>
            )}

            {webSearch && backend === "tavily" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="tavily-key" className="text-sm font-normal text-muted-foreground">
                  Tavily Search API Key
                  {tavilyKeySet && <span className="ml-2 text-xs text-emerald-500">Настроен</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="tavily-key"
                    type="password"
                    autoComplete="off"
                    placeholder={tavilyKeySet ? "Настроен (оставьте пустым, чтобы не менять)" : "Введите Tavily API Key (tvly-…)"}
                    value={tavilyKeyInput}
                    disabled={!loaded || savingTavilyKey}
                    onChange={(e) => setTavilyKeyInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={saveTavilyKey}
                    disabled={!loaded || savingTavilyKey || tavilyKeyInput.trim() === ""}
                  >
                    Сохранить
                  </Button>
                </div>
                {webSearch && backend === "tavily" && !tavilyKeySet && (
                  <p className="text-xs text-amber-500">
                    Выбран Tavily, но ключ ещё не настроен — инструмент поиска не включится, пока ключ не сохранён.
                  </p>
                )}
                <p className="text-muted-foreground text-xs">Зарегистрируйтесь и получите API Key на https://tavily.com.</p>
              </div>
            )}

            {webSearch && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ws-proxy" className="text-sm font-normal text-muted-foreground">
                  Выходной прокси (опционально)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ws-proxy"
                    autoComplete="off"
                    placeholder="http://host:port или socks5://host:port (пусто = прямое соединение)"
                    value={proxyInput}
                    disabled={!loaded || savingProxy}
                    onChange={(e) => setProxyInput(e.target.value)}
                  />
                  <Button type="button" onClick={saveProxy} disabled={!loaded || savingProxy}>
                    Сохранить
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Отдельный выходной прокси, используется только для обращения к поисковым конечным точкам
                  (VPN/SOCKS и т.п.). Не связан с MITM-прокси, записывающим трафик; используется при
                  отсутствии прямой сетевой доступности.
                </p>
              </div>
            )}

            {webSearch && (
              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <p className="text-muted-foreground text-xs">
                  Выполнить реальный поиск по запросу «test» с текущей конфигурацией (источник + прокси +
                  ключ), чтобы проверить работоспособность.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runTest}
                  disabled={!loaded || testing}
                  className="shrink-0"
                >
                  {testing ? "Проверка…" : "Тест поиска"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              Пользовательские скрипты · интерпретатор Python
            </CardTitle>
            <CardDescription>
              Используется пользовательскими инструментами типа <b>script</b> для запуска Python. При
              старте определяется автоматически (приоритет у python3); здесь можно вручную указать
              абсолютный путь к venv / конкретной версии, пусто = автоопределение во время выполнения.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                className="font-mono text-sm"
                placeholder="/usr/bin/python3 (пусто = автоопределение)"
                value={pyInterp}
                disabled={!loaded || saving}
                onChange={(e) => setPyInterp(e.target.value)}
              />
              <Button variant="outline" onClick={detectPython} disabled={!loaded || saving}>
                Определить заново
              </Button>
              <Button onClick={savePython} disabled={!loaded || saving}>
                Сохранить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CpuIcon className="size-4" />
              Параллелизм воркеров · количество Work Agent
            </CardTitle>
            <CardDescription>
              Количество рабочих агентов, выполняющихся параллельно на одну задачу (по умолчанию 3). Чем
              больше значение, тем больше параллельной разведки и выше расход. После изменения{" "}
              <b>применяется к задачам, запущенным после этого</b>, выполняющиеся задачи не затрагиваются.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                className="w-32 font-mono text-sm"
                placeholder="3"
                value={workers}
                disabled={!loaded || savingWorkers}
                onChange={(e) => setWorkers(e.target.value)}
              />
              <Button onClick={saveWorkers} disabled={!loaded || savingWorkers}>
                Сохранить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyboardIcon className="size-4" />
              Клавиша отправки в поле ввода диалога
            </CardTitle>
            <CardDescription>
              Используется совместно полем ввода диалога на странице «Диалог» и в деталях задачи для
              главного агента, применяется сразу после выбора, без сохранения.
              <br />
              Эта настройка <b>хранится только в этом браузере</b>, не синхронизируется с учётной записью —
              при смене браузера или очистке данных сайта потребуется настроить заново.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="chat-send-mode" className="text-sm font-normal text-muted-foreground">
              Способ отправки
            </Label>
            <Select value={sendMode} onValueChange={(v) => setChatSendMode(v as ChatSendMode)}>
              <SelectTrigger id="chat-send-mode" className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAT_SEND_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
