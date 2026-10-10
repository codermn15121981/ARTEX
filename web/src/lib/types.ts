// ARTEX domain model — types used across the UI.
// Derived from the functional spec (section 7: ключевые структуры данных).

export type TaskStatus = "created" | "queued" | "running" | "paused" | "done" | "failed" | "timeout";
export type EngineMode = "exploring" | "paused" | "stalled" | "idle";

export interface Task {
  id: string;
  name?: string; // Необязательное имя задачи; пусто/отсутствует=без имени, при отображении откат к описанию
  category_id?: number;
  category_name?: string;
  pinned?: boolean;
  pinned_at?: string | null;
  description: string;
  goal: string;
  status: TaskStatus;
  created_at: string;
  created_unix?: number; // created_at as unix seconds (run-duration calc)
  completed_at?: string; // RFC3339 finish time (done/failed); "" if unfinished
  completed_unix?: number; // completed_at as unix seconds (0/undef if unfinished)
  last_activity_unix?: number; // unix seconds of the last activity (0/undef if none)
  paused?: boolean;
  queued?: boolean;
  active?: boolean;
  in_flight?: number;
  findings?: { critical: number; high: number; medium: number; low: number }; // Число зарегистрированных находок (по уровням серьёзности)
  last_activity?: string;
  stalled?: boolean;
  goals_total?: number;
  goals_met?: number;
  engine_mode?: EngineMode;
  tokens?: TokenTotal; // whole-task token consumption
  llm_profile_id?: number; // LLM profile used; absent = default profile
  llm_profile_ids?: number[]; // ordered task-level failover chain
  active_llm_profile_id?: number; // profile used by the next LLM call
  llm_failover_state?: "default" | "ready" | "chain_exhausted" | string;
  llm_failover_reason?: string;
  source_task_ids?: string[]; // directly related tasks inherited as read-only context
  archive_blocked_by_task_id?: string; // live direct dependent that must be archived first
  company_ids?: number[]; // associated company scopes; current company assets join the task at creation
  coverage_enabled?: boolean; // Переключатель функции покрытия активов (задаётся при создании, по умолчанию включён); false=не считать/не показывать покрытие
}

export interface TaskCategory {
  id: number;
  name: string;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplate {
  id: number;
  name: string;
  description: string;
  goal: string;
  category_id?: number | null; // Предустановленная категория; null/отсутствует=нет
  intercept_rules?: AssetInterceptRuleInput[]; // Предустановленные правила перехвата/разрешения уровня задачи
  created_at: string;
  updated_at: string;
}

export interface DeleteTaskOptions {
  delete_assets: boolean;
  delete_traffic: boolean;
  delete_files: boolean;
  delete_findings: boolean;
  delete_llm_records: boolean;
}

export interface DeleteTaskResult {
  deleted: string;
  assets_deleted: number;
  assets_detached: number;
  traffic_deleted: number;
  files_deleted: boolean;
  findings_deleted: number;
  llm_records_deleted: number;
  cleanup_warning?: string;
}

export type TaskArchiveState =
  | "archive_queued"
  | "archiving"
  | "archive_failed"
  | "ready"
  | "restore_queued"
  | "restoring"
  | "restore_failed"
  | "delete_queued"
  | "deleting"
  | "delete_failed";

export interface TaskArchiveTokenStats {
  calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface TaskArchive {
  id: number;
  task_id: number;
  state: TaskArchiveState;
  phase: string;
  progress: number;
  error?: string;
  warnings?: string[];
  format_version: number;
  sha256?: string;
  original_size: number;
  compressed_size: number;
  task_name: string;
  task_description: string;
  task_goal: string;
  original_status: TaskStatus;
  category_id?: number;
  category_name?: string;
  source_task_ids: number[];
  remaining_timeout_seconds: number;
  data_counts: Record<string, number>;
  aggregate_stats: {
    tokens?: TaskArchiveTokenStats;
    skills?: Record<string, number>;
    tools?: Record<string, number>;
    findings?: Record<string, number>;
  };
  archived_at?: string;
  requested_at: string;
  created_at: string;
  updated_at: string;
}

export interface TaskArchivePage {
  items: TaskArchive[];
  total: number;
  page: number;
  size: number;
}

export interface ArchiveBatchItem {
  id: string;
  archive_id?: number;
  ok: boolean;
  queued: boolean;
  error?: string;
}

// ---- Asset graph (global, shared across tasks) ----
export type AssetType =
  | "company"
  | "domain"
  | "ip"
  | "port"
  | "service"
  | "site"
  | "endpoint"
  | "parameter"
  | "tech"
  | "credential"
  | "data";

export type NodeState = "observed" | "confirmed" | "tombstoned";

export interface AssetNode {
  id: string;
  type: AssetType;
  name: string;
  key: string; // nkey
  value?: string;
  company_id?: string; // ID компании-владельца; пусто=не принадлежит компании
  state: NodeState;
  confidence: number; // 0..1
  attrs?: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
}

export type AssetRel =
  | "owns"
  | "resolves"
  | "exposes"
  | "runs"
  | "serves"
  | "has_endpoint"
  | "has_param"
  | "fingerprinted"
  | "authenticates_as"
  | "reachable"
  | "has_subdomain";

export interface Edge {
  src: string;
  dst: string;
  rel: AssetRel | ExploreRel;
}

// Task asset view — server-side enriched, paginated.
export interface TaskAssetRef {
  id: string;
  name?: string;
  key: string;
  attrs?: Record<string, unknown>;
}

export interface TaskAssetItem extends AssetNode {
  techs?: TaskAssetRef[];
  auth?: TaskAssetRef[];
  params?: TaskAssetRef[];
}

export interface TaskAssetView {
  counts: Record<string, number>;
  total: number;
  items: TaskAssetItem[];
}

// ---- New unified asset model (new backend) ----
export type NewAssetType = "root_domain" | "ip" | "subdomain" | "app" | "service" | "endpoint";

export interface Asset {
  id: number;
  type: NewAssetType;
  company_id?: number;
  task_ids: number[];
  domain?: string;
  root_domain?: string;
  ip?: string;
  c_segment?: string;
  port?: number;
  icp?: string;
  bound_domains?: string[];
  open_ports?: { port: number; service?: string }[];
  record_type?: string;
  record_value?: string[] | string;
  bundle_id?: string;
  app_name?: string;
  category?: string;
  app_description?: string;
  app_icp?: string;
  url?: string;
  service_type?: string;
  service_name?: string;
  favicon_mmh3?: string;
  status_code?: number;
  content_length?: number;
  page_title?: string;
  technologies?: string[];
  auth?: Record<string, unknown>[];
  method?: string;
  params?: Record<string, unknown>[];
  extra?: Record<string, unknown>;
  last_seen: string;
  task_source?: string;
  task_source_summary?: string;
  task_source_node_id?: number;
}

export interface IntentAsset {
  intent_id: number | string;
  asset_id: number;
  type: NewAssetType;
  label: string;
  source: string;
  source_summary: string;
  source_node_id?: number;
  source_task_id: number;
  inherited: boolean;
}

export interface TaskAssetMutation {
  requested: number;
  attached: number;
  existing: number;
}

export interface TaskAssetScopeMutation {
  requested: number;
  assets_linked: number;
  assets_existing: number;
  scopes_added: number;
  scopes_existing: number;
}

// ---- Asset coverage graph (per task) ----
// Один узел силового «графа покрытия активов». key уникален: актив="a:<id>", компания="c:<id>",
// корневой домен без строки актива="r:<domain>". in_scope=false — серые контекстные узлы, нужные только для связей.
export interface CoverageGraphNode {
  key: string;
  kind: "company" | "root_domain" | "subdomain" | "ip" | "service" | "app" | "endpoint";
  label: string;
  tested: boolean;
  in_scope: boolean;
  asset_id?: number;
  company_id?: number;
  domain?: string;
  root_domain?: string;
  ip?: string;
  url?: string;
  port?: number;
  service_type?: string;
  app_name?: string;
  page_title?: string;
  status_code?: number;
}

export interface CoverageGraphEdge {
  src: string;
  dst: string;
}

export interface CoverageGraphData {
  nodes: CoverageGraphNode[];
  edges: CoverageGraphEdge[];
}

// Интенты/факты/находки, связанные с активом в графе исследования этой задачи (для панели узла графа покрытия).
export interface CoverageAssetRef {
  id: number;
  kind: string;
  state: string;
  summary: string;
  source_task_id?: string;
  inherited?: boolean;
}
export interface CoverageAssetRefs {
  intents: CoverageAssetRef[];
  facts: CoverageAssetRef[];
  findings: CoverageAssetRef[];
}

// ---- Workspace file manager (workDir) ----
export interface WorkspaceEntry {
  name: string;
  path: string; // workspace-relative, forward slashes
  dir: boolean;
  size: number;
  mtime: number; // unix millis
}
export interface WorkspaceListing {
  path: string;
  entries: WorkspaceEntry[];
}
export interface WorkspaceFile {
  path: string;
  size: number;
  binary: boolean;
  too_large?: boolean;
  content?: string;
}

// Одна строка тестируемой области задачи (знаменатель покрытия + граница авторизации).
export interface TaskScopeRow {
  id: number;
  task_id: number;
  kind: "company" | "root_domain" | "subdomain" | "ip" | "cidr" | "icp" | "keyword";
  company_id?: number;
  company_name?: string; // Разрешается на бэкенде через JOIN companies, значение только при kind=company
  domain?: string;
  net?: string;
  value?: string;
  source: "auto" | "agent" | "manual";
  reason?: string;
}

export type CompanyScopeKind = "domain" | "ip" | "cidr" | "icp" | "keyword";

// Структурированное правило области активов, отправляемое при создании компании.
export interface CompanyScopeRule {
  kind: CompanyScopeKind;
  value: string;
}

// Результат записи области активов. errors — некорректные строки в этой отправке;
// warnings — не связанные с этой отправкой проблемы существующих данных, которые могут
// привести к неожиданному результату принадлежности (например, актив с именем хоста в поле ip).
export interface CompanyScopeMutation {
  added: number;
  skipped: number;
  invalid: number;
  errors?: string[];
  warnings?: string[];
}

// Одна строка правила области активов компании (единственный источник истины принадлежности).
export interface ScopeRow {
  id: number;
  company_id: number;
  kind: CompanyScopeKind;
  domain?: string; // Значение при kind=domain
  net?: string; // Значение при kind=ip|cidr
  value?: string; // Может вернуться напрямую от бэкенда при kind=icp|keyword
  raw: string; // Исходный ввод пользователя, для отображения и предзаполнения
  reason?: string;
}

// Компания: узел актива с type=company + логотип + число активов + правила области активов.
export interface Company {
  id: number;
  name: string;
  logo?: string; // URL удалённого логотипа; если пусто, фронтенд использует первую букву имени
  asset_count: number;
  scope?: ScopeRow[];
}

// ---- Exploration graph (per task) ----
export type ExploreKind = "task" | "begin" | "goal" | "intent" | "fact" | "finding" | "hint" | "digest";
export type GoalState = "open" | "met" | "abandoned";
export type IntentState = "open" | "running" | "paused" | "done" | "blocked" | "exhausted" | "stopped";
export type FindingState = "confirmed" | "dismissed";
export type HintState = "active" | "consumed";
export type ExploreRel = "spawns" | "derived_from" | "yields" | "proves" | "covers";

export interface TaskNode {
  id: string;
  type: ExploreKind;
  payload?: string;
  priority: number; // 0..10
  state: string; // GoalState | IntentState | FindingState | HintState
  origin: string;
  ts: string;
  source_task_id?: string;
  inherited?: boolean;
  delete_reason?: string; // Причина удаления при мягком удалении интента (state='deleted')
}

// Одна страница трансляции: узлы с пагинацией по порядку создания + рёбра, затронутые этой
// страницей + узлы на другом конце рёбер (refs, индекс по id) — так каждая запись показывает,
// «откуда пришло и что получилось», без загрузки всего графа.
export interface ExplorationNodePage {
  items: TaskNode[];
  total: number;
  page: number;
  size: number;
  edges: Edge[];
  refs: Record<string, TaskNode>;
  // ID узла → активы, закреплённые за этим узлом (показываются при развёртывании записи,
  // включая узлы этой страницы и их соседей).
  assets: Record<string, FindingAsset[]>;
}

export interface ExplorationNodeQuery {
  page?: number;
  size?: number;
  kinds?: ExploreKind[];
  states?: string[];
  q?: string;
  order?: "asc" | "desc";
}

// Цель для карточки управления целями (бэкенд уже разбил payload на text/vulnclass).
export interface TaskGoal {
  id: string;
  text: string;
  vulnclass?: string;
  state: string; // GoalState
  origin?: string;
  ts: string;
}

// Операционное ограничение для карточки управления ограничениями (allow=разрешено / deny=запрещено).
export type ConstraintKind = "allow" | "deny";
export interface TaskConstraint {
  id: string;
  kind: ConstraintKind;
  text: string;
  origin?: string;
  ts?: string;
}

// ---- Findings ----
export type Severity = "critical" | "high" | "medium" | "low";

// Статус обработки находки: в ожидании / в процессе / подтверждено / обработано / исправлено /
// ложное срабатывание / проигнорировано / дубликат / риск принят.
export type FindingStatus =
  | "pending"
  | "in_progress"
  | "confirmed"
  | "resolved"
  | "fixed"
  | "false_positive"
  | "ignored"
  | "duplicate"
  | "risk_accepted";

// FindingAsset — актив, привязанный к находке (label уже отрендерен на бэкенде).
export interface FindingAsset {
  id: string;
  type: string;
  label: string;
}

export interface Finding {
  traffic_count?: number;
  evidence_version?: number;
  report_evidence_version?: number;
  report_stale?: boolean;
  id: string;
  finding_id?: string; // ID строки в отдельной таблице findings, хэндл для обновления статуса (может отсутствовать у старых узлов задачи)
  vulnclass: string;
  name?: string; // Название находки; при отсутствии отображение откатывается к vulnclass
  severity: Severity;
  status: FindingStatus;
  summary: string;
  evidence: string;
  report?: string; // Подробный отчёт (Markdown); возвращается только в API деталей, в списке пусто
  intent_id?: string;
  param_id?: string;
  task_id?: string;
  task_description?: string;
  source_task_id?: string;
  inherited?: boolean;
  assets?: FindingAsset[];
  ts: string;
}

// FindingsPage — серверный постраничный ответ списка находок.
export interface FindingsPage {
  items: Finding[];
  total: number;
  page: number;
  page_size: number;
}

export interface FindingGroup {
  task_id: string | number | null;
  task_name?: string; // Необязательное имя задачи; пусто/отсутствует=без имени
  task_description: string;
  task_status: string;
  count: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  last_found_at: string;
}

export interface FindingGroupsPage {
  items: FindingGroup[];
  total: number;
  finding_total: number;
  page: number;
  page_size: number;
}

export interface FindingDeepenResponse {
  task_id: string;
  intent_id: string;
  state: IntentState;
  queued: boolean;
}

// FindingStats — агрегация по всей таблице находок (карточка статистики + выпадающий список типов), считается на сервере, не зависит от пагинации.
export interface FindingStats {
  total: number;
  pending: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  vulnclasses: string[];
  tasks: FindingTaskOption[];
}

// FindingTaskOption — элемент выпадающего списка фильтра «по задаче» на странице находок:
// задача с находками (пустое описание означает, что задача удалена, фронтенд отображает id) и число находок.
export interface FindingTaskOption {
  id: string | number;
  name?: string; // Необязательное имя задачи; пусто/отсутствует=без имени
  description: string;
  count: number;
}

// FindingQuery — параметры пагинации/фильтрации/сортировки списка находок.
export interface FindingQuery {
  page: number;
  pageSize: number;
  severity?: "all" | Severity;
  status?: "all" | FindingStatus;
  vulnclass?: string;
  task?: string; // ID задачи; "all"/пусто = не фильтровать по задаче
  query?: string;
  sort?: "severity" | "time";
  // Key узла дерева активов; выбор узла = выбор всего его поддерева. Пусто = не фильтровать по активу.
  assetScope?: string;
}

// ---- Findings by asset (представление по активам) ----
export type FindingAssetKind = "company" | "root_domain" | "subdomain" | "ip" | "service" | "app" | "endpoint" | "none";

// FindingAssetNode — узел дерева активов. key имеет вид a:<id> (актив), c:<id> (компания),
// r:<domain> (корневой домен без строки актива в базе), __none__ (без связанного актива).
export interface FindingAssetNode {
  key: string;
  parent?: string;
  kind: FindingAssetKind;
  label: string;
  asset_id?: number;
  company_id?: number;
  self: number; // Число находок, напрямую привязанных к этому активу
  total: number; // Включая потомков, с дедупликацией по находкам
  critical: number;
  high: number;
  medium: number;
  low: number;
  last_found_at: string;
}

export interface FindingAssetTree {
  nodes: FindingAssetNode[];
  finding_total: number;
  truncated: boolean;
  dropped_kinds?: string[];
}

// FINDING_UNASSIGNED_ASSET соответствует db.FindingUnassignedAsset на бэкенде.
export const FINDING_UNASSIGNED_ASSET = "__none__";

// ---- Activity / sessions ----
export type ActivityKind =
  | "tool_use"
  | "tool_result"
  | "text"
  | "thinking"
  | "result"
  | "user"
  | "intent" // LLM-generated exploration objective leading a worker session (UI-synthesized)
  | "round" // planner round boundary marker (engine-emitted)
  | "usage" // live cumulative token usage (per model turn); not rendered
  | "llm_switch" // automatic/manual task-level LLM switch
  | "llm_failover" // task-level provider switch / chain exhaustion audit event
  | "intercept_request"; // user-approval request from the intercept layer

// ChatAttachment — загруженный файл: path относительно рабочего каталога сессии/задачи (CWD агента).
export interface ChatAttachment {
  name: string;
  path: string;
  size: number;
  abs?: string; // Абсолютный путь (возвращается при scope=staging для отложенной загрузки; записать в описание перед созданием задачи)
}

export interface Activity {
  seq: number;
  intent_id?: string;
  worker: string; // session owner: planner | mainagent | work#1 ...
  ts: string;
  kind: ActivityKind;
  tool?: string;
  tool_use_id?: string;
  is_error?: boolean;
  summary: string;
  detail?: string;
  metadata?: {
    llm_transition?: LLMTransition;
  };
  source_task_id?: string;
  inherited?: boolean;
  main_seg?: number; // main-agent conversation segment (present only on worker="mainagent" rows)
  // token usage (present only on kind='result')
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface LLMAuditProfile {
  id: number;
  name: string;
  format: string;
  model: string;
}

export interface LLMTransition {
  mode: "automatic" | "manual" | "exhausted";
  reason: string;
  previous?: LLMAuditProfile;
  next?: LLMAuditProfile;
}

export interface TaskLLMResolution {
  profile_id?: number;
  name: string;
  format: string;
  model: string;
  source: "task_chain" | "agent_binding" | "global_profile" | "environment" | "global";
  available: boolean;
  reason?: string;
}

export interface TaskLLMResolutions {
  mainagent: TaskLLMResolution;
  planner: TaskLLMResolution;
  worker: TaskLLMResolution;
}

// ---- Agent triggers (планирование P3, только для пользовательских agent) ----
export interface AgentTrigger {
  id: number;
  agent_key: string;
  enabled: boolean;
  interval_sec: number; // По таймеру: каждые N секунд (0=без таймера)
  on_finding: boolean; // Срабатывает при обнаружении находки в любой задаче
  on_goal_met: boolean; // Срабатывает при достижении цели в любой задаче
  on_task_timeout: boolean; // Срабатывает при тайм-ауте любой задачи
  on_tool_call: boolean; // Срабатывает при вызове (завершении выполнения) выбранного инструмента
  on_task_create: boolean; // Срабатывает при создании любой задачи
  interval_message: string; // Отдельное сообщение пользователя для каждого условия срабатывания
  finding_message: string;
  goal_message: string;
  task_timeout_message: string;
  tool_call_message: string;
  task_create_message: string;
  tool_names: string[]; // Ключи инструментов, выбранные для on_tool_call (минимум один)
  last_fire?: string;
}

// ---- Conversations (chat page) ----
export interface ActiveFindingRetest {
  id: number;
  finding_id: string;
  conversation_id: number;
  status: "pending" | "running";
}

export interface FindingRetest {
  id: number;
  finding_id: number;
  conversation_id: number | null;
  status: "pending" | "running" | "completed" | "failed" | "stopped";
  verdict: "" | "reproduced" | "fixed" | "inconclusive";
  notes: string;
  summary: string;
  evidence: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Conversation {
  id: number;
  running?: boolean; // live server state, returned with the conversation list
  agent_key: string;
  title: string;
  llm_profile_id?: number;
  pinned?: boolean;
  pinned_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Backend logs (/logs page) ----
export interface LogLine {
  seq: number;
  db_id?: number; // server_logs.id; present for DB-persisted lines
  ts: string;
  level: "info" | "warn" | "error";
  tag: string;
  text: string;
}

export type SessionRole = "mainagent" | "planner" | "worker" | "system";
export type SessionStatus = "running" | "paused" | "done" | "blocked" | "exhausted" | "pending" | "stopped" | "deleted";

// Daily token aggregate bucket (GET /api/tokens/daily).
export interface DailyTokenBucket {
  date: string; // "YYYY-MM-DD"
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

// Per-worker token usage (GET /api/exploration/tokens).
export interface TokenUsage {
  worker: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface SessionTokenUsage {
  session: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface BatchControlItem {
  id: string;
  ok: boolean;
  status?: string;
  queued?: boolean;
  error?: string;
}

// Результат массового изменения категории по каждой задаче. Ошибка возможна только если задача уже удалена, сама запись категории атомарна.
export interface BatchCategoryItem {
  id: string;
  ok: boolean;
  error?: string;
}

// Whole-task (all agents) token aggregate.
export interface TokenTotal {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

// Global per-profile token spend from the llm_usage ledger (GET /api/tokens/usage).
export interface ProfileUsage {
  profile_name: string;
  calls: number;
  tasks: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

// One (profile, UTC day) token bucket for the dashboard's daily chart (new source).
export interface ProfileDayUsage {
  profile_name: string;
  date: string; // YYYY-MM-DD
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
}

// Response of GET /api/tokens/usage — the dashboard's "new" (llm_usage) token view.
export interface UsageStats {
  by_profile: ProfileUsage[];
  daily: ProfileDayUsage[];
}

// Per-model token usage for one task (GET /api/llm/records/by-model), from the
// always-on llm_usage metering ledger. calls = number of LLM calls on this model.
export interface ModelTokenStat {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface Session {
  id: string;
  role: SessionRole;
  title: string;
  status: SessionStatus;
  live: boolean;
  last_activity: string;
  intent_id?: string;
  source_task_id?: string;
  inherited?: boolean;
  seg?: number; // main-agent session: which conversation segment (0 = original)
}

// ---- Security ----
export interface AuditEntry {
  ts: string;
  tool: string;
  action: "allow" | "block";
  reason?: string;
  command?: string;
}

export interface Audit {
  entries?: AuditEntry[];
  attributions?: Record<string, number>;
}

// ---- Traffic ----
export interface TrafficExchange {
  id: string;
  ts: string;
  host: string;
  method: string;
  url: string;
  status: number;
  content_type: string;
  resp_len: number;
}

export interface TrafficResp {
  enabled: boolean;
  proxy?: string;
  count?: number; // global total (unfiltered)
  total?: number; // rows matching the current filter (for pagination)
  page?: number;
  size?: number;
  exchanges?: TrafficExchange[];
}

// Full raw request/response of one exchange (lazy-loaded on row select).
export interface TrafficDetail {
  req: string;
  resp: string;
}

// One distinct recorded host with its exchange count (target picker).
export interface TrafficHost {
  host: string;
  count: number;
}

// ---- App settings (runtime toggles) ----
export interface Settings {
  traffic_capture: boolean;
  agent_traffic_binding: boolean; // Автоматическая привязка Agent трафика как доказательства, по умолчанию выключено; не влияет на ручную привязку
  llm_record: boolean; // Переключатель записи LLM (по умолчанию выключен); при выключении ни один вызов LLM не записывается
  // Web search. brave_key_set / tavily_key_set reflect whether a key is stored
  // (the values are never returned). On PUT, send the corresponding field to set/clear.
  web_search_enabled: boolean;
  web_search_backend: string; // "ddgs" | "brave-free" | "tavily" | "deepseek"
  brave_key_set: boolean;
  tavily_key_set: boolean;
  // write-only: only sent on PUT to store/clear the key.
  brave_search_api_key?: string;
  tavily_search_api_key?: string;
  // Отдельный исходящий прокси (http/https/socks5) для доступа к поисковым эндпоинтам; не связан
  // с MITM-прокси, записывающим трафик. Пусто=прямое соединение.
  web_search_proxy?: string;
  // Глобальный исходящий прокси (http/https/socks5, может включать user:pass), через него идёт весь
  // целевой трафик. При включённом перехвате трафика работает как восходящий MITM-прокси; при
  // выключенном — напрямую внедряется в bash/WebFetch агента. Пусто=прямое соединение.
  global_proxy?: string;
  python_interpreter?: string; // Путь к интерпретатору python для пользовательских скриптовых инструментов (пусто=определяется во время выполнения)
  workers?: number; // Число параллельных worker-агентов (по умолчанию 3); действует для задач, запущенных после изменения
  // Лимит параллельных задач: максимум одновременно «выполняющихся» задач. Выключено=без ограничения;
  // при включении новые задачи сверх лимита становятся в очередь и запускаются автоматически при освобождении места.
  task_concurrency_enabled?: boolean; // По умолчанию false
  task_concurrency_limit?: number; // При включении по умолчанию 5
  // Пул LLM (отказоустойчивость). По умолчанию выключен; при включении agent без явно указанной модели
  // автоматически переключается на следующую конфигурацию, если текущая недоступна
  // (нет баланса / недействительный ключ / лимит запросов / сбой сервиса).
  llm_pool_enabled?: boolean; // По умолчанию false
  // Откатываться ли в цепочку пула при сбое agent/задачи, привязанных к конкретной конфигурации.
  // По умолчанию false = привязка означает эксклюзивность.
  llm_pool_bind_fallback?: boolean;
  // Область внедрения операционных ограничений (по умолчанию обе включены): встраивать
  // allow/deny-ограничения задачи в системный промпт соответствующего agent.
  constraints_inject_planner?: boolean;
  constraints_inject_worker?: boolean;
  // Экспериментальная функция: сжатие контекста на основе модели noa (по умолчанию выключено).
  // При включении четыре типа agent платформы (planner/worker/главный agent/диалог) передают сжатие
  // контекста модели noa вместо встроенной compaction; читается один раз на запуск, действует для
  // запусков, начатых после изменения.
  noa_compaction?: boolean;
  // ---- Push-уведомления о находках (сами каналы — отдельный ресурс, см. /api/notify/*, здесь только три глобальные настройки) ----
  notify_enabled?: boolean; // Общий переключатель push-уведомлений, по умолчанию включён; для быстрой остановки на время обслуживания
  notify_public_base_url?: string; // Внешний адрес для обратной ссылки на детали находки; пусто=сообщение без ссылки
  notify_digest_interval_min?: number; // Период режима сводки (минуты), по умолчанию 30
}

// ---- Push-уведомления о находках ----

// NotificationFilter — условия фильтрации канала, все поля необязательны, по умолчанию без фильтрации.
// Бэкенд не валидирует ни одно поле: при некорректной конфигурации считается «совпадением»
// (лучше лишнее уведомление, чем пропущенное).
export interface NotificationFilter {
  min_severity?: string; // "" | low | medium | high | critical
  task_ids?: number[]; // Пусто=без ограничений; если не пусто, требуется пересечение с задачами находки
  asset_ids?: number[]; // Пусто=без ограничений; если не пусто, требуется пересечение с привязанными активами находки
  vulnclass_include?: string[]; // Пусто=принимать всё; если не пусто, требуется совпадение типа находки с любым ключевым словом (регистронезависимая подстрока)
  vulnclass_exclude?: string[]; // Совпадение с любым ключевым словом исключает (исключение приоритетнее включения)
  on_status_change?: boolean; // Получать ли также события изменения статуса обработки находки
}

// NotificationChannel — экземпляр канала. Поля config различаются в зависимости от kind,
// а поля учётных данных при чтении заменяются маской, начинающейся на "__masked__" — отправка её обратно без изменений означает «не менять».
export interface NotificationChannel {
  id: number;
  name: string;
  kind: string;
  enabled: boolean;
  mode: "realtime" | "digest";
  config: Record<string, unknown>;
  filter: NotificationFilter;
  rate_per_min: number;
  created_at: string;
  updated_at: string;
  // secret_keys задаётся бэкендом по типу канала, фронтенд на основе этого рендерит поля пароля
  // и подсказку «оставить пустым, чтобы не менять», без жёсткого кодирования знаний о каналах.
  secret_keys: string[];
}

// NotificationKind — метаданные типа канала, возвращаемые /api/notify/meta.
export interface NotificationKind {
  kind: string;
  default_rate_per_min: number;
  secret_keys: string[];
}

export interface NotificationMeta {
  kinds: NotificationKind[];
  enabled: boolean;
  public_base_url: string;
  digest_interval_min: string;
  defaults: { digest_interval_min: number };
  stats: {
    channels: number;
    channels_on: number;
    pending: number;
    failed: number;
    sent_today: number;
    backlog_age_ms: number;
  };
}

// NotificationDelivery — запись доставки, используется для истории доставок и повторной отправки при сбое.
export interface NotificationDelivery {
  id: number;
  finding_id: string;
  event_kind: string; // finding_created | finding_status_changed
  channel_id: number;
  channel_name: string;
  channel_kind: string;
  state: "pending" | "sending" | "sent" | "failed" | "skipped";
  attempts: number;
  last_error: string;
  batch_id?: number;
  created_at: string;
  sent_at?: string;
  next_attempt_at: string;
  title: string;
  severity: string;
}

// ---- LLM config ----
export interface LLMProfile {
  id: string;
  name: string;
  format: "openai" | "anthropic" | "openai-responses";
  base_url?: string;
  proxy?: string;
  model: string;
  api_key_hint?: string;
  rate_per_second: number;
  rate_per_minute: number;
  context_window_k?: number;
  // Переключатель размышлений (thinking.type): ""=не отправлять (по умолчанию) | "disabled"=выключено | "enabled"=включено
  thinking_type?: string;
  // Интенсивность размышлений: ""=не отправлять (по умолчанию) | "low"/"medium"/"high"/"xhigh"/"max"
  reasoning_effort?: string;
  is_default: boolean;
  // Приоритет в цепочке пула: чем больше, тем раньше выбирается. Активная конфигурация всегда
  // первая в цепочке, независимо от этого значения.
  priority?: number;
  // true = не использовать как цель отказоустойчивости (всё равно может быть явно привязана к agent/задаче).
  pool_exclude?: boolean;
  // true (по умолчанию) = потоковый режим (SSE) | false = по-настоящему не потоковый (stream:false, ответ целиком).
  streaming?: boolean;
  // Лимит токенов в одном ответе. 0 = не отправлять это поле, значение по умолчанию решает сервер.
  // Не путать с context_window_k: это общая ёмкость модели, используется только локально для порога сжатия.
  max_tokens?: number;
  // Какое имя поля запроса использовать для лимита, имеет смысл только при format="openai":
  // ""=max_tokens (по умолчанию) | "max_completion_tokens" (нужно только для reasoning-моделей OpenAI)
  max_tokens_field?: string;
  // Имя пользовательского заголовка сессии: если не пусто, каждый запрос несёт этот HTTP-заголовок
  // со значением session id текущей сессии/интента. ""=не отправлять. Используется для шлюзов с
  // кэшированием промптов/привязанной маршрутизацией по заголовку session-id.
  session_header_key?: string;
  // Переопределение повторов для этой конфигурации (установка соединения/пустой ответ/окно безопасности провайдера). Пусто/все 0 = следовать глобальной политике.
  retry?: LLMRetryOverride;
}

// ---- Политика повторов LLM ----
// Два параметра одного уровня повторов. Оба означают «0 = не настроено»:
//   attempts    0=использовать число по умолчанию | -1=выключить повторы этого уровня | >0=число повторов
//   interval_ms 0=использовать экспоненциальную задержку по умолчанию | >0=использовать этот фиксированный интервал в мс
export interface LLMRetryRule {
  attempts: number;
  interval_ms: number;
}

// Три уровня, которые может переопределить отдельная конфигурация LLM (все «следуют за эндпоинтом»).
export interface LLMRetryOverride {
  connect: LLMRetryRule; // Повтор установки соединения: сброс/тайм-аут соединения, 429/5xx, до начала потока
  empty: LLMRetryRule; // Повтор при пустом ответе: завершилось без какого-либо содержимого (только формат openai)
  stream: LLMRetryRule; // Повтор в окне безопасности того же провайдера: воспроизведение при разрыве потока до получения вывода
}

// Глобальная политика = значения по умолчанию для трёх уровней выше + два уровня, существующие только глобально:
//   breaker  предохранитель пула (attempts=сколько подряд мгновенных сбоев вызывает срабатывание, interval_ms=фиксированная длительность охлаждения)
//   intent   повтор интента (worker завершился с model_error — перезапускается весь интент)
export interface LLMRetryPolicy extends LLMRetryOverride {
  breaker: LLMRetryRule;
  intent: LLMRetryRule;
}

// ---- Пул LLM (отказоустойчивость) ----
// Позиция и состояние здоровья конфигурации в цепочке пула. state:
//   ok       в норме
//   degraded есть подряд идущие сбои, но порог срабатывания предохранителя не достигнут
//   tripped  предохранитель сработал, пропускается на время охлаждения (cooldown_secs — оставшиеся секунды)
export interface LLMPoolMember {
  profile_id: string;
  name: string;
  model: string;
  format: string;
  priority: number;
  active: boolean; // Является ли текущей активной конфигурацией (всегда первая в цепочке)
  excluded: boolean; // pool_exclude: не участвует в пуле
  state: "ok" | "degraded" | "tripped";
  fails: number;
  trips: number;
  cooldown_secs: number;
  last_error?: string;
  last_at?: string;
}

export interface LLMPoolStatus {
  enabled: boolean;
  bind_fallback: boolean;
  chain: LLMPoolMember[];
}

// ---- Agents ----
export interface Agent {
  id: string;
  key: string; // Встроенные: goals/planner/mainagent/worker; пользовательские: произвольный key
  name: string;
  description?: string;
  role: string;
  builtin: boolean;
  enabled: boolean;
  llm_profile_id?: number | null; // Привязанная LLM-конфигурация; null/отсутствует = следовать задаче/сессии/глобальной
  max_turns?: number; // 0 = без ограничения
  run_seconds?: number; // Лимит настенного времени одного запуска worker (секунды); 0 = без ограничения
  web_search?: boolean; // Включён ли веб-поиск (подчиняется глобальному переключателю системы)
  interactive_shell?: boolean; // Включён ли интерактивный shell (семейство инструментов постоянной PTY-сессии)
  // Стратегия обработки после срабатывания P3 (имеет смысл только для пользовательских agent)
  trigger_run_mode?: "serial" | "parallel"; // Последовательная очередь / отдельная параллельная сессия на каждое срабатывание
  trigger_merge_mode?: "by_task" | "all" | "none"; // Только serial: объединять по одной задаче / объединять все / не объединять
  trigger_max_parallel?: number; // Только parallel: лимит параллельных сессий на agent; 0=без ограничения
  // Число привязок (возвращается только списковым API): видимые MCP / видимые Skill / привязанные инструменты
  mcp_count?: number;
  skill_count?: number;
  tool_count?: number;
}

export interface PromptVar {
  name: string;
  description: string;
  example: string;
  source: "exploration" | "runtime" | "distilled";
}

export interface PromptVersion {
  version: number;
  ts: string;
  note: string;
  template_text: string;
}

export interface AgentDetail {
  agent: Agent;
  prompt: string;
  variables: PromptVar[];
  versions: PromptVersion[];
  visibility: { mcp: number[]; skill: string[] };
  // Кандидаты LLM-конфигураций для привязки (для выпадающего списка «модель по умолчанию»); текущая привязка — agent.llm_profile_id
  llm_profiles?: { id: number; name: string; model: string; is_default: boolean }[];
  wrapup_prompt?: string; // Сохранённый текст завершающего промпта (пусто=использовать встроенный по умолчанию)
  wrapup_default?: string; // Встроенный завершающий промпт по умолчанию (заполнитель/восстановление по умолчанию)
  wrapup_max_turns?: number; // Сохранённое число завершающих ходов (0=использовать встроенное по умолчанию)
  wrapup_max_turns_default?: number; // Встроенное число завершающих ходов по умолчанию (для подсказки "0=по умолчанию N")
  // Завершающий промпт при тайм-ауте уровня задачи (только worker/planner, раздел показывается только если task_timeout_wrapup_supported=true)
  task_timeout_wrapup_supported?: boolean;
  task_timeout_wrapup_prompt?: string;
  task_timeout_wrapup_default?: string;
  task_timeout_wrapup_max_turns?: number;
  task_timeout_wrapup_max_turns_default?: number;
}

// ---- MCP ----
export interface MCPServer {
  id: number;
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  enabled: boolean;
  insecure?: boolean; // http: skip TLS cert verification (self-signed servers)
  tools?: string[]; // mcp_tools_cache (names only, for the count)
}

export interface MCPTool {
  name: string;
  description: string;
}

// ---- Skills ----
// Fields align with the agentskills.io open specification.
// description covers both "what the skill does" and "when to use it".
export interface SkillItem {
  name: string; // unique key = directory name
  description?: string; // required per spec; covers what + when to use
  license?: string; // optional: SPDX identifier or free text
  compatibility?: string; // optional: environment requirements
  mcps?: string[]; // MCP server names this skill unlocks on load
  files: string[]; // files in the skill directory
  // Статистика вызовов (журнал skill_usage). Для skill, который никогда не вызывался: calls=0, last_used отсутствует.
  calls: number;
  tasks: number; // Число задач, загружавших его (диалоговые сессии не считаются)
  usage_agents: string[]; // Ключи agent, загружавших его
  last_used?: string;
}

// SkillCall — один вызов Skill() (список последних вызовов отдельного skill).
export interface SkillCall {
  ts: string;
  agent_key: string;
  task_id: number; // 0 = не в контексте задачи (диалоговая сессия)
  session_id: string;
  args_len: number;
}

// MissingSkill — упомянутый, но не существующий skill — пробел «хотели использовать, но его нет».
export interface MissingSkill {
  skill: string;
  calls: number;
  agents: string[];
  last_used?: string;
}

// ---- Tools (каталог встроенных инструментов) ----
// key + handler live in Go; only these fields are page-editable. system tools lock
// the key and the parameter *structure* (name/type/required) — the per-param
// description/default and the agent binding are what move.
export interface Tool {
  key: string;
  system: boolean;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>; // full JSON-Schema (object with properties)
  agents: string[]; // bound agent keys
  enabled: boolean;
  kind?: "builtin" | "shell" | "command" | "script" | "http"; // Тип пользовательского инструмента
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exec?: Record<string, any>; // Спецификация выполнения пользовательского инструмента (kind!=builtin)
  deferred?: boolean; // Отложенная схема (SearchExtraTools/ExecuteExtraTool)
  calls?: number; // persistent runtime invocation count (older APIs may omit it)
}

// ---- Stats ----
export interface Stats {
  assets: number;
  engine_mode: EngineMode;
  llm_configured: boolean;
  roe_enabled: boolean;
  findings_confirmed: number;
  active_task?: Partial<Task>;
}

// ---- Intercept Rules ----
export type InterceptAction = "allow" | "deny" | "ask";
export type InterceptMatchTarget = "tool_name" | "tool_input";
export type InterceptMatchType = "string" | "regex";

export interface InterceptRule {
  id: number;
  name: string;
  enabled: boolean;
  priority: number;
  match_target: InterceptMatchTarget;
  match_type: InterceptMatchType;
  pattern: string;
  action: InterceptAction;
  message: string;
  timeout_enabled: boolean;
  timeout_seconds: number;
  timeout_action: "deny" | "allow";
  created_at: string;
  updated_at: string;
}

// ---- Asset Intercept Rules (перехват активов: глобальный чёрный список) ----
export type AssetInterceptKind =
  | "exact_domain"
  | "exact_ip"
  | "exact_url"
  | "fuzzy_domain"
  | "fuzzy_ip"
  | "fuzzy_url"
  | "cidr";

// action используется только для правил уровня задачи: block=перехват (тестирование запрещено) allow=разрешено (белый список).
export type AssetInterceptAction = "block" | "allow";

// Элемент ввода правила перехвата/разрешения активов уровня задачи (используется при создании задачи, редактировании деталей задачи).
export interface AssetInterceptRuleInput {
  action: AssetInterceptAction;
  kind: AssetInterceptKind;
  pattern: string;
  note: string;
  enabled: boolean;
}

export interface AssetInterceptRule {
  id: number;
  enabled: boolean;
  action?: AssetInterceptAction; // У глобальных правил этого поля нет (всегда перехват); правила уровня задачи различают block/allow
  kind: AssetInterceptKind;
  pattern: string;
  note: string;
  builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface InterceptPending {
  decision_source?: "rule" | "model" | "unknown" | "";
  id: number;
  rule_id?: number;
  conversation_id?: number;
  task_id?: string;
  agent_name: string;
  tool_name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_input: Record<string, any>;
  status: "pending" | "allowed" | "denied" | "timeout";
  reason: string; // message правила или причина решения модели (решение модели с префиксом [模型])
  decided_at?: string;
  created_at: string;
}

// JudgeConfig: глобальная конфигурация модельного резервного одобрения (решение модели только когда ни одно правило перехвата не сработало).
export interface JudgeConfig {
  enabled: boolean;
  profile_id: number; // 0 = следовать активной/конфигурации по умолчанию
  prompt: string; // Промпт для принятия решения; если не задан при GET, бэкенд возвращает полный текст встроенного шаблона
  timeout_seconds: number; // Тайм-аут вызова модели
  fail_action: "allow" | "ask" | "deny"; // Откат при ошибке/тайм-ауте модели/невозможности разбора ответа
  ask_timeout_seconds: number; // Тайм-аут ожидания одобрения после перевода модели в режим ask (на человека)
  ask_timeout_action: "allow" | "deny"; // Действие по умолчанию после тайм-аута одобрения
}

// JudgeUsage: суммарное использование токенов модельного резервного одобрения (канал judge) + ежедневная серия за последние N дней.
export interface JudgeDayUsage {
  date: string; // YYYY-MM-DD (UTC)
  calls: number;
  input_tokens: number;
  output_tokens: number;
}
export interface JudgeUsage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  daily: JudgeDayUsage[];
}

export interface InterceptApprovalFilter {
  status?: InterceptPending["status"];
  decision_source?: "rule" | "model" | "unknown";
}

// InterceptApprovalRow enriches InterceptPending with conversation/task and rule context.
export interface InterceptApprovalRow extends InterceptPending {
  conv_title: string; // "" if no linked conversation
  conv_agent_key: string; // "" if no linked conversation
  rule_name: string; // "" if rule was deleted
}

// ── Синхронизация активов (источник данных ScopeSentry) ──────────────────────────────────────────────
export interface SSProject {
  id: string; // MongoDB ObjectID — используется как filter.project
  name: string;
  logo?: string;
  AssetCount?: number;
  tag?: string;
}

export interface SSTask {
  id: string;
  name: string; // Используется как filter.task
  status?: number;
  progress?: number;
  creatTime?: string;
  endTime?: string;
}

// ConvTokenSummary — one conversation's token total (+ profile/date) for merging
// chat usage into the dashboard token stats. GET /api/tokens/conversations.
export interface ConvTokenSummary {
  llm_profile_id: number | null;
  created_at: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

// ---- Command recording (Bash execution history) ----
export interface CommandRecord {
  id: number;
  exploration_id: number;
  worker: string;
  tool: string;
  command: string; // raw tool input (JSON)
  output: string;
  is_error: boolean;
  created_at: string;
}

// Статистика вызовов одного инструмента (/commands/stats); errors — число неудачных среди них.
export interface ToolStat {
  tool: string;
  total: number;
  errors: number;
}

// ---- LLM recording ----
export interface LLMRecordItem {
  id: number;
  ts: string;
  model: string;
  profile_name: string;
  session_id: string;
  task_id: string;
  worker: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  status: string;
  error?: string;
}

export interface LLMRecordDetail extends LLMRecordItem {
  request_body: string;
  response_body: string;
  // Фактический HTTP-обмен с провайдером: запрос — полное тело, отправленное buildBody()
  // (включая схему инструментов), ответ — исходные SSE-кадры. request_body/response_body выше —
  // нормализованное представление, из которого убраны схема инструментов и блоки tool_use. В старых записях пусто.
  raw_request?: string;
  raw_response?: string;
}

// One distinct task with its LLM-record count (task picker on the records page).
export interface LLMTask {
  task_id: string;
  count: number;
}

// The exact JSON sent to the review model, retained for all model verdicts.
export interface InterceptReviewInput {
  version: number;
  background?: {
    // worker_summary is retained only for immutable v2/v3 snapshots.
    source: "user_message" | "worker_summary";
    text: string;
    truncated?: boolean;
  };
  // Version 1 snapshots are immutable and remain readable in historical audits.
  task?: {
    task_id: number;
    description: string;
    goal: string;
    constraints: { id: number; kind: string; text: string; origin: string; created_at: number }[];
    truncated?: boolean;
  };
  working_directory?: string;
  worker_intent?: string;
  turn_input?: string;
  background_truncated?: boolean;
  // Legacy v1/v2 snapshots only; v3 never sends execution history.
  history?: {
    tool_use_id: string;
    tool: string;
    arguments_preview: string;
    result: string;
    status: "succeeded" | "failed";
    truncated?: boolean;
  }[];
  history_truncated?: boolean;
  correlation?: "exact" | "ambiguous" | "unavailable";
  tool_name: string;
  arguments: Record<string, unknown>;
}

// Immutable review snapshot plus separately recorded execution outcome.
export interface InterceptAudit {
  model_input?: InterceptReviewInput;
  model_input_digest?: string;
  run_id?: string;
  tool_use_id?: string;
  correlation: "exact" | "ambiguous" | "unavailable";
  input_digest: string;
  user_message: string;
  user_truncated?: boolean;
  context:
    | { kind: string; tool?: string; tool_use_id?: string; text: string; is_error?: boolean; truncated?: boolean }[]
    | null;
  context_truncated?: boolean;
  captured_at: string;
  model_fallback?: boolean;
  initial_action: "allow" | "ask" | "deny";
  initial_reason: string;
  effective_action?: "allow" | "deny";
  decision_reason?: string;
  rule_name?: string;
  config_digest?: string;
  profile_id?: number;
  execution_status: "not_started" | "not_executed" | "awaiting_result" | "succeeded" | "failed" | "unknown";
  output?: string;
  output_truncated?: boolean;
  execution_ended_at?: string;
}
export interface InterceptDetail extends InterceptApprovalRow {
  audit: InterceptAudit | null;
}

export type TrafficEvidenceRole = "baseline" | "proof" | "verification" | "supporting";
export interface TrafficEvidenceRef {
  traffic_id: string;
  role?: TrafficEvidenceRole;
  note?: string;
}
export interface TrafficEvidenceSnapshot {
  id: string;
  source_traffic_id: string;
  captured_at: number;
  url: string;
  method: string;
  status: number;
  content_type: string;
  req_head?: string;
  resp_head?: string;
  req_hash: string;
  resp_hash: string;
  req_len: number;
  resp_len: number;
}
export interface FindingTrafficBinding {
  id: string;
  finding_id: string;
  snapshot_id: string;
  role: TrafficEvidenceRole;
  note: string;
  position: number;
  created_at: string;
  snapshot: TrafficEvidenceSnapshot;
}
export interface FindingTraffic {
  finding_id: string;
  version: number;
  report_version: number;
  bindings: FindingTrafficBinding[];
}
export interface EvidenceBodyPreview {
  content: string;
  offset: number;
  total: number;
  next_offset: number;
  truncated: boolean;
  binary: boolean;
}
export interface FindingTrafficDetail {
  binding: FindingTrafficBinding;
  request: EvidenceBodyPreview;
  response: EvidenceBodyPreview;
}

/** GET /api/update/check — результат сравнения текущей версии с последним релизом на GitHub. */
export interface UpdateCheck {
  /** Текущая работающая версия; для разработческих сборок — "dev" или форма с суффиксом от git describe. */
  current: string;
  /** Форма запуска. В docker замена образа затрагивает только writable-слой контейнера, пересборка контейнера откатит версию к образу. */
  mode: "docker" | "binary";
  os: string;
  arch: string;
  repo: string;
  /** Есть ли предыдущая версия для откат (artex.old). */
  has_backup: boolean;
  /** Итог самозапуска автообновления при этом старте (сбой замены / выполнен откат и т.п.), пусто если ничего не произошло. */
  boot_notice?: string;
  rolled_back?: boolean;
  /** Причина, если запрос к GitHub не удался; в этом случае ниже остальных полей не будет. */
  error?: string;
  latest?: string;
  notes?: string;
  html_url?: string;
  published_at?: string;
  /** Имя пакета релиза для текущей платформы и действительно ли этот Release его содержит. */
  asset?: string;
  asset_available?: boolean;
  size?: number;
  has_update?: boolean;
  /** Можно ли сравнить версии; для разработческих сборок false, тогда обновление в один клик отключено. */
  comparable?: boolean;
  /** Пояснение, когда comparable равно false. */
  reason?: string;
}

/** Одна запись о прогрессе обновления, отправляемая через /api/update/stream. */
export interface UpdateProgress {
  phase: "idle" | "downloading" | "verifying" | "extracting" | "staged" | "failed";
  /** Имеет смысл только на этапе загрузки (0-100); на остальных этапах -1. */
  percent: number;
  message: string;
  version?: string;
  error?: string;
}

// Original execution selected from an approval, never submitted to the reviewer.
export interface InterceptExecution {
  conversation_id: number | null;
  task_id: string | null;
  session: string;
  seq: number;
  items: Activity[];
}
