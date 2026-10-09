import {
  Activity,
  Ban,
  BellRing,
  Bot,
  Brain,
  Bug,
  ClipboardList,
  FolderOpen,
  FolderSync,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Network,
  Plug,
  Radio,
  ScrollText,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  Terminal,
  Wrench,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Функции",
    items: [
      { id: "dashboard", title: "Дашборд", url: "/dashboard", icon: LayoutDashboard },
      { id: "chat", title: "Диалог", url: "/chat", icon: MessageSquare },
      { id: "tasks", title: "Задачи", url: "/function/tasks", icon: Target },
      { id: "findings", title: "Находки", url: "/function/findings", icon: Bug },
      { id: "traffic", title: "Трафик", url: "/function/traffic", icon: Activity },
      { id: "commands", title: "Выполнение инструментов", url: "/function/commands", icon: Terminal },
      { id: "llm-records", title: "Запись LLM", url: "/function/llm-records", icon: Radio },
      { id: "assets", title: "Активы", url: "/function/assets", icon: Network },
      { id: "sync", title: "Синхронизация активов", url: "/function/sync", icon: FolderSync },
      { id: "workspace", title: "Рабочее пространство", url: "/function/workspace", icon: FolderOpen },
    ],
  },
  {
    id: 2,
    label: "Система",
    items: [
      { id: "llm", title: "LLM", url: "/system/llm", icon: Brain },
      { id: "agents", title: "Агенты", url: "/system/agents", icon: Bot },
      { id: "mcp", title: "MCP", url: "/system/mcp", icon: Plug },
      { id: "skills", title: "Навыки", url: "/system/skills", icon: Sparkles },
      { id: "tools", title: "Инструменты", url: "/system/tools", icon: Wrench },
      { id: "notify", title: "Уведомления", url: "/system/notify", icon: BellRing },
      { id: "intercept", title: "Правила перехвата", url: "/system/intercept", icon: ShieldAlert },
      { id: "asset-intercept", title: "Перехват активов", url: "/system/intercept/assets", icon: Ban },
      { id: "approvals", title: "Записи согласований", url: "/system/intercept/approvals", icon: ClipboardList },
      { id: "logs", title: "Логи", url: "/system/logs", icon: ScrollText },
      { id: "settings", title: "Системные настройки", url: "/system/settings", icon: Settings2 },
    ],
  },
];
