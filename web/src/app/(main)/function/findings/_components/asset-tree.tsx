"use client";

import * as React from "react";

import {
  BuildingIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  GlobeIcon,
  LayoutTemplateIcon,
  LinkIcon,
  type LucideIcon,
  NetworkIcon,
  RefreshCwIcon,
  SearchIcon,
  SmartphoneIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { FindingAssetKind, FindingAssetNode } from "@/lib/types";
import { cn } from "@/lib/utils";

// Иконки используют то же соответствие типов, что и страница активов — один и тот же
// актив выглядит одинаково в обоих местах.
const KIND_ICON: Record<FindingAssetKind, LucideIcon> = {
  company: BuildingIcon,
  root_domain: GlobeIcon,
  subdomain: GlobeIcon,
  ip: NetworkIcon,
  app: SmartphoneIcon,
  service: LayoutTemplateIcon,
  endpoint: LinkIcon,
  none: CircleDashedIcon,
};

const KIND_LABEL: Record<FindingAssetKind, string> = {
  company: "Компания",
  root_domain: "Корневой домен",
  subdomain: "Поддомен",
  ip: "IP",
  app: "Приложение",
  service: "Сервис",
  endpoint: "Эндпоинт",
  none: "Не привязано",
};

// TreeNode — дерево, собранное из массива узлов. Бэкенд уже сортирует его так, что у
// одного родителя узлы с большим числом находок идут первыми, здесь остаётся только
// монтировать их в порядке массива.
interface TreeNode extends FindingAssetNode {
  children: TreeNode[];
  depth: number;
  /** Текст, который реально рендерится в дереве; полный label остаётся в поле label
   *  (используется в title при наведении и в breadcrumbs). */
  display: string;
}

function stripBrackets(host: string) {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function parseAssetURL(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

// hostOf возвращает хост, который представляет узел: для URL берётся hostname, для
// «host:port» — host, в остальных случаях это сама метка (корневой домен / поддомен / IP).
function hostOf(label: string): string {
  const url = parseAssetURL(label);
  if (url) return stripBrackets(url.hostname);
  const hostPort = label.match(/^(.+):(\d+)$/);
  return stripBrackets(hostPort ? hostPort[1] : label);
}

// shortLabel убирает префикс, повторяющий родительский узел. У service / endpoint
// label — это полный URL, а хост-домен/IP уже написан строкой выше — глубокие узлы и
// без того узкие, и если повторить host ещё раз, по-настоящему информативные порт и
// путь будут полностью срезаны. Полное значение остаётся в title и в breadcrumbs.
function shortLabel(node: FindingAssetNode, parent?: FindingAssetNode): string {
  if (!parent) return node.label;

  // Поддомен висит под корневым доменом: убираем суффикс корневого домена, оставляем
  // только собственную часть.
  if (node.kind === "subdomain" && node.label.endsWith(`.${parent.label}`)) {
    return node.label.slice(0, -(parent.label.length + 1)) || node.label;
  }
  if (node.kind !== "service" && node.kind !== "endpoint") return node.label;

  // Метка родителя — это именно префикс своей метки (эндпоинт висит под сервисом с
  // тем же URL, сервис — под тем же IP): просто отрезаем его.
  if (node.label.startsWith(parent.label)) {
    return node.label.slice(parent.label.length) || node.label;
  }

  // Иначе сокращаем только если родитель действительно является хостом этого URL,
  // иначе потеряется различимая информация (например, сервис повис прямо под
  // корневым доменом из-за отсутствия строки поддомена — тогда нужно показать полный URL).
  if (hostOf(node.label) !== hostOf(parent.label)) return node.label;

  const url = parseAssetURL(node.label);
  if (!url) return node.label;
  if (node.kind === "endpoint") return `${url.pathname}${url.search}` || "/";
  const scheme = url.protocol.replace(":", "");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${scheme} :${port}`;
}

export function buildAssetTree(nodes: FindingAssetNode[]): TreeNode[] {
  const byKey = new Map<string, TreeNode>();
  for (const node of nodes) {
    byKey.set(node.key, { ...node, children: [], depth: 0, display: node.label });
  }
  const roots: TreeNode[] = [];
  for (const node of nodes) {
    const current = byKey.get(node.key);
    if (!current) continue;
    const parent = node.parent ? byKey.get(node.parent) : undefined;
    // Если родительский узел отсутствует (отрезан усечённым уровнем), поднимаем узел
    // на верхний уровень, чтобы всё поддерево не пропало целиком.
    if (parent) {
      parent.children.push(current);
      current.display = shortLabel(node, parent);
    } else {
      roots.push(current);
    }
  }
  const setDepth = (node: TreeNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) setDepth(child, depth + 1);
  };
  for (const root of roots) setDepth(root, 0);
  return roots;
}

// assetPathOf возвращает путь от верхнего уровня до указанного узла — для breadcrumbs
// справа. На каждом уровне так же показывается только приращение относительно
// предыдущего (display), полное значение остаётся в label.
export function assetPathOf(nodes: FindingAssetNode[], key: string | null): (FindingAssetNode & { display: string })[] {
  if (!key) return [];
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const path: FindingAssetNode[] = [];
  const seen = new Set<string>();
  let current = byKey.get(key);
  while (current && !seen.has(current.key)) {
    seen.add(current.key);
    path.unshift(current);
    current = current.parent ? byKey.get(current.parent) : undefined;
  }
  return path.map((node, index) => ({ ...node, display: shortLabel(node, path[index - 1]) }));
}

// filterTree фильтрует по ключевому слову: совпавшие узлы сохраняются вместе со всей
// цепочкой предков (сами предки могут не совпадать). Потомки совпавшего узла также
// сохраняются, чтобы можно было продолжить раскрытие вглубь.
function filterTree(nodes: TreeNode[], keyword: string): TreeNode[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodes;
  const walk = (node: TreeNode): TreeNode | null => {
    const hit = node.label.toLowerCase().includes(kw);
    if (hit) return node;
    const children = node.children.map(walk).filter((c): c is TreeNode => c !== null);
    if (children.length === 0) return null;
    return { ...node, children };
  };
  return nodes.map(walk).filter((n): n is TreeNode => n !== null);
}

// collectKeys собирает все key в (под)дереве — используется для «развернуть все совпадения».
function collectKeys(nodes: TreeNode[], out: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    out.add(node.key);
    collectKeys(node.children, out);
  }
  return out;
}

interface AssetTreeProps {
  nodes: FindingAssetNode[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  loading?: boolean;
  truncated?: boolean;
  droppedKinds?: string[];
  /** Общее число находок справа, когда актив не выбран — используется в строке «Все активы». */
  findingTotal: number;
  /** Режим «по активам» не опрашивается, счётчики дерева обновляются этой кнопкой или
   *  через изменения находок на странице. */
  onRefresh?: () => void;
}

export function AssetTree({
  nodes,
  selected,
  onSelect,
  loading,
  truncated,
  droppedKinds,
  findingTotal,
  onRefresh,
}: AssetTreeProps) {
  const [keyword, setKeyword] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  // Запоминает узлы, которые пользователь вручную свернул, чтобы «по умолчанию
  // развёрнутый верхний уровень» не разворачивал их снова при каждом обновлении.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());

  const roots = React.useMemo(() => buildAssetTree(nodes), [nodes]);
  const visible = React.useMemo(() => filterTree(roots, keyword), [roots, keyword]);

  // При поиске разворачиваем все подходящие ветки, иначе совпадения, скрытые в
  // свёрнутых узлах, равносильны отсутствию результата поиска.
  const searching = keyword.trim() !== "";
  const searchKeys = React.useMemo(() => (searching ? collectKeys(visible) : null), [searching, visible]);

  const isExpanded = React.useCallback(
    (node: TreeNode) => {
      if (searchKeys) return searchKeys.has(node.key);
      if (expanded.has(node.key)) return true;
      // Верхний уровень по умолчанию развёрнут на один шаг: более глубокие уровни
      // пользователь разворачивает сам, чтобы сразу не выгрузить тысячи строк.
      return node.depth === 0 && !collapsed.has(node.key);
    },
    [collapsed, expanded, searchKeys],
  );

  const toggle = React.useCallback(
    (node: TreeNode) => {
      const open = isExpanded(node);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (open) next.delete(node.key);
        else next.add(node.key);
        return next;
      });
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (open) next.add(node.key);
        else next.delete(node.key);
        return next;
      });
    },
    [isExpanded],
  );

  let emptyHint = "При текущем фильтре нет находок, привязанных к активам.";
  if (loading) emptyHint = "Загрузка…";
  else if (searching) emptyHint = "Нет подходящих активов.";

  const rows: React.ReactNode[] = [];
  const pushRows = (list: TreeNode[]) => {
    for (const node of list) {
      const open = isExpanded(node);
      rows.push(
        <AssetTreeRow
          key={node.key}
          node={node}
          open={open}
          selected={selected === node.key}
          onToggle={() => toggle(node)}
          onSelect={() => onSelect(selected === node.key ? null : node.key)}
        />,
      );
      if (open && node.children.length > 0) pushRows(node.children);
    }
  };
  pushRows(visible);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <InputGroup className="flex-1">
          <InputGroupInput
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Фильтр активов"
            aria-label="Фильтр активов"
          />
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>
        {onRefresh && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Обновить дерево активов"
            title="Обновить дерево активов"
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
          selected === null ? "bg-accent font-medium" : "hover:bg-accent/50",
        )}
      >
        <span>Все активы</span>
        <span className="text-xs tabular-nums text-muted-foreground">{findingTotal}</span>
      </button>

      <div className="max-h-[24rem] min-h-0 flex-1 overflow-y-auto pr-2 lg:max-h-[calc(100vh-16rem)]">
        <div className="flex flex-col">
          {rows}
          {rows.length === 0 && <p className="px-2 py-8 text-center text-xs text-muted-foreground">{emptyHint}</p>}
        </div>
      </div>

      {truncated && (
        <p className="px-1 text-xs text-muted-foreground">
          Слишком много активов, скрыты уровни:{" "}
          {(droppedKinds ?? []).map((k) => KIND_LABEL[k as FindingAssetKind] ?? k).join(" / ")} (счётчики всё равно
          учтены на уровне выше). Сузьте с помощью фильтров или поля поиска, чтобы увидеть полную структуру.
        </p>
      )}
    </div>
  );
}

function AssetTreeRow({
  node,
  open,
  selected,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const Icon = KIND_ICON[node.kind] ?? GlobeIcon;
  const hasChildren = node.children.length > 0;
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 text-sm",
        selected ? "bg-accent" : "hover:bg-accent/50",
      )}
      style={{ paddingLeft: `${node.depth * 10}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label={open ? "Свернуть" : "Развернуть"}
          aria-expanded={open}
        >
          <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        title={`${KIND_LABEL[node.kind] ?? node.kind} · ${node.label}`}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={cn("min-w-0 truncate", selected && "font-medium")}>{node.display}</span>
      </button>
      <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums">
        {node.critical > 0 && (
          <span className="text-rose-600" title={`Критич.: ${node.critical}`}>
            {node.critical}
          </span>
        )}
        {node.high > 0 && (
          <span className="text-red-500" title={`Высокие: ${node.high}`}>
            {node.high}
          </span>
        )}
        <span className="text-muted-foreground" title={`Всего находок: ${node.total}`}>
          {node.total}
        </span>
      </span>
    </div>
  );
}
