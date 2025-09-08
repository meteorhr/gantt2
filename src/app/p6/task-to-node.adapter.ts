// Дерево WBS → TASK как Node[] с правильной сортировкой по PROJWBS.seq_num
// + опции переопределения родителей, + стабильная сортировка задач по task_code,
// + порядок OPC: в одном родителе сначала задачи, затем вложенные WBS.

import { Node, ResourceAssignment } from '../gantt/models/gantt.model';
import { IsoDate } from '../gantt/models/gantt.types';
import { TaskRow } from './models/task.model';
import { TaskPredRow } from './models/taskpred.model';
import { PROJWBSRow as WbsRow } from './models/index';
import { buildResourceIndex } from './resources.adapter';
import { XERDocument, XERScalar, getRows } from './parser';
import { XerDexieService } from './dexie.service';

const T_I18N_PREFIX = 'task';
const codeKey = (section: string, code?: string | null) =>
  (code ? `${T_I18N_PREFIX}.${section}.${code}` : null);

type BaselineSource = 'target' | 'early' | 'none';

export interface WbsBuildOptions {
  parentOverride?: Record<number, number | null>;
  parentOverrideByName?: Record<string, string | null>;
  baselineSource?: BaselineSource;
  debug?: boolean;
  translate?: (key: string, params?: Record<string, unknown>) => string;
}

// --- SAFE COMPARE HELPERS (добавить один раз в файле task-to-node.adapter.ts) ---
function toKeyString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function toKeyNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}
const _collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function cmpStr(a: unknown, b: unknown): number {
  return _collator.compare(toKeyString(a), toKeyString(b));
}
function cmpNum(a: unknown, b: unknown): number {
  const na = toKeyNumber(a);
  const nb = toKeyNumber(b);
  return na - nb;
}
function cmpDate(a: unknown, b: unknown): number {
  const ta = a instanceof Date ? a.getTime()
    : (typeof a === 'string' ? Date.parse(a) : Number.NaN);
  const tb = b instanceof Date ? b.getTime()
    : (typeof b === 'string' ? Date.parse(b) : Number.NaN);
  const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
  const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
  return va - vb;
}
/** Кортежное сравнение: первым отличившимся критерием определяется порядок */
function cmpTuple(...parts: Array<number>): number {
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== 0) return parts[i];
  }
  return 0;
}

export function buildWbsTaskTree(doc: XERDocument, opts?: WbsBuildOptions): Node[] {
  // (1) WBS
  const wbsRows = getRows<WbsRow>(doc, 'PROJWBS');
  const wbsMap = new Map<number, WbsNode>();
  const byShort = new Map<string, number>();
  const byName  = new Map<string, number>();

  for (const w of wbsRows) {
    if (typeof w.wbs_id !== 'number') continue;
    const id = w.wbs_id;
    const shortName = (w.wbs_short_name ?? '').toString().trim();
    const longName  = (w.wbs_name ?? '').toString().trim();
    const name = longName || shortName || `WBS ${id}`;
    const parent = typeof w.parent_wbs_id === 'number' ? w.parent_wbs_id : null;
    const seq = typeof w.seq_num === 'number' ? w.seq_num : 0;

    wbsMap.set(id, {
      kind: 'wbs',
      wbsId: id,
      name,
      shortName,
      parentWbsId: parent,
      seq,
      children: [],
      minStart: null, maxFinish: null,
      baseMin: null, baseMax: null,
      critical: false,
    });

    if (shortName) byShort.set(shortName, id);
    if (longName)  byName.set(longName, id);
  }

  // (2) переопределения родителей — без изменений
  if (opts?.parentOverrideByName) {
    for (const [childShort, parentShortOrNull] of Object.entries(opts.parentOverrideByName)) {
      const childId = byShort.get(childShort) ?? byName.get(childShort);
      if (childId == null) continue;
      const parentId =
        parentShortOrNull == null
          ? null
          : (byShort.get(parentShortOrNull) ?? byName.get(parentShortOrNull) ?? null);
      const node = wbsMap.get(childId);
      if (node) node.parentWbsId = parentId;
    }
  }
  if (opts?.parentOverride) {
    for (const [childIdStr, parentIdVal] of Object.entries(opts.parentOverride)) {
      const childId = Number(childIdStr);
      const node = wbsMap.get(childId);
      if (node) node.parentWbsId = (parentIdVal == null ? null : Number(parentIdVal));
    }
  }
  if (opts?.debug) debugPrintWbsParents(wbsMap);

  // (3) зависимости
  const preds = buildPredecessorMap(doc);

  // (3.1) ИНДЕКС РЕСУРСОВ
  const resIdx = buildResourceIndex(doc);

  const baselineSource: BaselineSource = opts?.baselineSource ?? 'target';

  // (4) TASK → Node
  const tasks = getRows<TaskRow>(doc, 'TASK', { required: true });
  for (const t of tasks) {
    // Collect all date sources
    const actStart     = toIsoDateOrUndef(pickDate(t, 'act_start_date'));
    const actFinish    = toIsoDateOrUndef(pickDate(t, 'act_end_date'));

    const targetStart  = toIsoDateOrUndef(pickDate(t, 'target_start_date'));
    const targetFinish = toIsoDateOrUndef(pickDate(t, 'target_end_date'));

    const earlyStart   = toIsoDateOrUndef(pickDate(t, 'early_start_date'));
    const earlyFinish  = toIsoDateOrUndef(pickDate(t, 'early_end_date'));

    const lateStart    = toIsoDateOrUndef(pickDate(t, 'late_start_date'));
    const lateFinish   = toIsoDateOrUndef(pickDate(t, 'late_end_date'));

    const expectEnd    = toIsoDateOrUndef(pickDate(t, 'expect_end_date'));

    // Agreed convention:
    // - Actual dates are stored in Node.start / Node.finish when available
    // - Target dates are stored in Node.baselineStart / Node.baselineFinish
    // - If actual is missing, fall back to target → early → late → expect
    const startISO: IsoDate | null =
      actStart ?? targetStart ?? earlyStart ?? lateStart ?? toIsoDateOrNull(pickDate(t, 'expect_end_date'));

    const finishISO: IsoDate | null =
      actFinish ?? targetFinish ?? earlyFinish ?? lateFinish ?? expectEnd ?? toIsoDateOrNull(pickDate(t, 'expect_end_date'));

    if (!startISO || !finishISO) continue;

    const baselineStart =
      baselineSource === 'target' ? toIsoDateOrUndef(pickDate(t, 'target_start_date')) :
      baselineSource === 'early'  ? toIsoDateOrUndef(pickDate(t, 'early_start_date'))  :
      undefined;

    const baselineFinish =
      baselineSource === 'target' ? toIsoDateOrUndef(pickDate(t, 'target_end_date')) :
      baselineSource === 'early'  ? toIsoDateOrUndef(pickDate(t, 'early_end_date'))  :
      undefined;

    const complete = clamp0to100(numberOrNull(t['phys_complete_pct'])) ?? undefined; // индексация скобками, безопасно для XER
    const critical = typeof t.total_float_hr_cnt === 'number' ? t.total_float_hr_cnt <= 0 : false;
    const dependency = preds.get(t.task_id) ?? [];
    const resources = resIdx.get(t.task_id) ?? [];

    const task_type_code = (t.task_type as string | null) ?? 'TT_Task';
    const complete_pct_type_code = (t.complete_pct_type as string | null) ?? null;
    const duration_type_code = (t.duration_type as string | null) ?? null;
    const priority_type_code = (t.priority_type as string | null) ?? 'PT_Normal';
    const status_code_code = (t.status_code as string | null) ?? 'TK_NotStart';

    // Normalize known duration_type aliases (e.g., Primavera variants)
    const normDurationCode = (k: string | null) => {
      if (!k) return k;
      if (k === 'DT_FixedDUR2') return 'DT_FixedDrtn';
      return k;
    };

    const task_type_key = codeKey('task_type', task_type_code);
    const complete_pct_type_key = codeKey('complete_pct_type', complete_pct_type_code);
    const duration_type_key = codeKey('duration_type', normDurationCode(duration_type_code));
    const priority_type_key = codeKey('priority_type', priority_type_code);
    const status_code_key = codeKey('status_code', status_code_code);

    const tr = opts?.translate;
    const task_type_label = task_type_key && tr ? tr(task_type_key) : null;
    const complete_pct_type_label = complete_pct_type_key && tr ? tr(complete_pct_type_key) : null;
    const duration_type_label = duration_type_key && tr ? tr(duration_type_key) : null;
    const priority_type_label = priority_type_key && tr ? tr(priority_type_key) : null;
    const status_code_label = status_code_key && tr ? tr(status_code_key) : null;

    const taskNode: Node = {
      id: String(t.task_id),
      task_code: (t.task_code as any) ?? undefined, // может прийти числом из XER — cmpStr обработает
      task_type: task_type_code,
      complete_pct_type: complete_pct_type_code,
      duration_type: duration_type_code,
      priority_type: priority_type_code,
      float_path: t.float_path ?? null,
      float_path_order: t.float_path_order ?? null,
      status_code: status_code_code,
      // i18n keys for Transloco (and resolved labels if translate provided)
      task_type_i18n: task_type_key,
      complete_pct_type_i18n: complete_pct_type_key,
      duration_type_i18n: duration_type_key,
      priority_type_i18n: priority_type_key,
      status_code_i18n: status_code_key,

      task_type_label,
      complete_pct_type_label,
      duration_type_label,
      priority_type_label,
      status_code_label,

      // Detailed date set
      earlyStart,
      earlyFinish,
      lateStart,
      lateFinish,
      expectEnd,

      name: (t.task_name as any) ?? (t.task_code as any) ?? `Task ${t.task_id}`,
      start: startISO,
      finish: finishISO,
      baselineStart,
      baselineFinish,
      complete,
      dependency,
      children: [],      // задачам детей не даём
      critical,
      resources: resources,   // ресурсы в дереве
      rsrc_names: buildRsrcNames(resources),
    };

    const wbsId = (typeof t.wbs_id === 'number') ? t.wbs_id : null;
    const parentWbs = (wbsId != null) ? wbsMap.get(wbsId) : null;

    const bucket = parentWbs ?? ensureUnassigned(wbsMap);
    bucket.children.push(taskNode);

    bucket.minStart  = minIso(bucket.minStart,  taskNode.start);
    bucket.maxFinish = maxIso(bucket.maxFinish, taskNode.finish);
    if (baselineStart && baselineFinish) {
      bucket.baseMin = minIso(bucket.baseMin, baselineStart);
      bucket.baseMax = maxIso(bucket.baseMax, baselineFinish);
    }
    bucket.critical = bucket.critical || taskNode.critical === true;
  }

  // (5) линковка WBS→WBS (как было)
  for (const w of wbsMap.values()) {
    if (w.parentWbsId != null) {
      const p = wbsMap.get(w.parentWbsId);
      if (p) p.children.push(w);
    }
  }

  // (6) корни и финализация
  const rootWbsNodes = [...wbsMap.values()].filter(w => !(w.parentWbsId != null && wbsMap.has(w.parentWbsId)));
  rootWbsNodes.sort((a, b) =>
    cmpTuple(
      cmpNum(a.seq, b.seq),
      cmpStr(a.name, b.name)
    )
  );

  const roots: Node[] = [];
  for (const w of rootWbsNodes) {
    const n = finalizeWbsAsNode(w);
    if (n) roots.push(n);
  }
  return roots;
}

/* ===================== служебные структуры и функции ===================== */

type WbsNode = {
  kind: 'wbs';
  wbsId: number;
  name: string;
  shortName: string;
  parentWbsId: number | null;
  seq: number;
  children: (WbsNode | Node)[];
  minStart: IsoDate | null;
  maxFinish: IsoDate | null;
  baseMin: IsoDate | null;
  baseMax: IsoDate | null;
  critical: boolean;
};

function ensureUnassigned(map: Map<number, WbsNode>): WbsNode {
  let un = map.get(-1);
  if (!un) {
    un = {
      kind: 'wbs', wbsId: -1, name: 'Unassigned', shortName: 'Unassigned',
      parentWbsId: null, seq: 0, children: [],
      minStart: null, maxFinish: null, baseMin: null, baseMax: null, critical: false
    };
    map.set(-1, un);
  }
  return un;
}

/** Финализируем WBS в Node.
 * OPC-порядок: СПЕРВА задачи, затем дочерние WBS.
 * Задачи сортируются по task_code (натурально), WBS — по PROJWBS.seq_num.
 */
function finalizeWbsAsNode(w: WbsNode): Node | null {
  const wbsKids: WbsNode[] = [];
  const taskKids: Node[] = [];

  for (const c of w.children) {
    if ((c as any).kind === 'wbs') {
      wbsKids.push(c as WbsNode);
    } else {
      taskKids.push(c as Node);
    }
  }

  // 1) Задачи: по task_code (натурально), затем по дате/имени/идентификатору
  taskKids.sort(byTaskSortKey);

  // 2) WBS-дети: по seq_num, затем по имени; рекурсивная финализация
  wbsKids.sort((a, b) =>
    cmpTuple(
      cmpNum(a.seq, b.seq),
      cmpStr(a.name, b.name)
    )
  );
  const wbsChildNodes: Node[] = [];
  for (const wk of wbsKids) {
    const n = finalizeWbsAsNode(wk);
    if (n) wbsChildNodes.push(n);
  }

  // 3) Итог: задачи → WBS
  const childNodes: Node[] = [...taskKids, ...wbsChildNodes];
  if (childNodes.length === 0) return null;

  // Агрегируем даты/критичность
  for (const n of childNodes) {
    w.minStart  = minIso(w.minStart,  n.start);
    w.maxFinish = maxIso(w.maxFinish, n.finish);
    if (n.baselineStart && n.baselineFinish) {
      w.baseMin = minIso(w.baseMin, n.baselineStart);
      w.baseMax = maxIso(w.baseMax, n.baselineFinish);
    }
    w.critical = w.critical || n.critical === true;
  }

  const start  = w.minStart  ?? earliestChildStart(childNodes);
  const finish = w.maxFinish ?? latestChildFinish(childNodes);
  if (!start || !finish) return null;

  return {
    id: `WBS:${w.wbsId}`,
    name: `${w.shortName ? `${w.shortName} - ` : ''}${w.name}`,
    start,
    finish,
    baselineStart: w.baseMin ?? undefined,
    baselineFinish: w.baseMax ?? undefined,
    complete: undefined,
    dependency: [],
    children: childNodes,
    critical: w.critical,
  };
}

/* ---------- сортировки и утилиты ---------- */

function byTaskSortKey(a: Node, b: Node): number {
  // 1) task_code — «человеческая» сортировка с цифрами
  const c1 = cmpStr(a.task_code, b.task_code);
  if (c1 !== 0) return c1;

  // 2) start — по дате (IsoDate строки «YYYY-MM-DD» корректно парсятся)
  const c2 = cmpDate(a.start, b.start);
  if (c2 !== 0) return c2;

  // 3) name — строкой
  const c3 = cmpStr(a.name, b.name);
  if (c3 !== 0) return c3;

  // 4) стабильный «добивочный» ключ
  return cmpStr(a.id, b.id);
}

function earliestChildStart(children: Node[]): IsoDate | null {
  let acc: IsoDate | null = null;
  for (const c of children) acc = minIso(acc, c.start);
  return acc;
}
function latestChildFinish(children: Node[]): IsoDate | null {
  let acc: IsoDate | null = null;
  for (const c of children) acc = maxIso(acc, c.finish);
  return acc;
}

function buildPredecessorMap(doc: XERDocument): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const rows = getRows<TaskPredRow>(doc, 'TASKPRED');
  for (const r of rows) {
    if (typeof r.task_id !== 'number' || typeof r.pred_task_id !== 'number') continue;
    const arr = map.get(r.task_id) ?? [];
    arr.push(String(r.pred_task_id));
    map.set(r.task_id, arr);
  }
  for (const [k, arr] of map.entries()) {
    const uniq = Array.from(new Set(arr));
    uniq.sort((x, y) => Number(x) - Number(y));
    map.set(k, uniq);
  }
  return map;
}

function pickDate(
  row: Partial<Record<string, XERScalar>>,
  key: string
): Date | string | null | undefined {
  const v = row[key];
  if (v == null) return v as any;
  if (v instanceof Date) return v;
  if (typeof v === 'string') return v;
  return null;
}
/** То же, что toIsoDateOrNull, но без null в результате (IsoDate | undefined). */
function toIsoDateOrUndef(input: Date | string | null | undefined): IsoDate | undefined {
  const v = toIsoDateOrNull(input);
  return v === null ? undefined : v;
}

function toIsoDateOrNull(input: Date | string | null | undefined): IsoDate | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}` as IsoDate;
  }
  const s = input.trim();
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m1) {
    const y = +m1[1], mo = +m1[2], d = +m1[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${m1[1]}-${m1[2]}-${m1[3]}` as IsoDate;
  }
  const dt = new Date(s.replace(' ', 'T'));
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}` as IsoDate;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function clamp0to100(v: number | null): number | null {
  if (v == null) return null;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v * 100) / 100;
}
function minIso(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return a <= b ? a : b;
}
function maxIso(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return a >= b ? a : b;
}

// Диагностика родителей WBS (по желанию)
function debugPrintWbsParents(map: Map<number, WbsNode>) {
  console.group('[XER] PROJWBS parents');
  [...map.values()]
    .sort((a, b) => cmpTuple(cmpNum(a.seq, b.seq), cmpNum(a.wbsId, b.wbsId)))
    .forEach(w => {
      console.log(
        `WBS ${w.wbsId} [${w.shortName}] "${w.name}" -> parent: ${w.parentWbsId ?? 'null'} seq=${w.seq}`
      );
    });
  console.groupEnd();
}

function buildRsrcNames(list: ResourceAssignment[]): string | null {
  const acc: string[] = [];
  for (const r of list) {
    // приоритет: полное имя ресурса → короткое имя → роль
    const name =
      (r.rsrc_name ?? r.rsrc_short_name ?? r.role_short_name ?? r.role_name ?? '')
        .toString()
        .trim();
    if (name && !acc.includes(name)) acc.push(name);
  }
  return acc.length ? acc.join(', ') : null;
}

/** Построить дерево напрямую из IndexedDB (Dexie), не требуя XERDocument извне. */
export async function buildWbsTaskTreeFromIndexedDb(
  dexie: XerDexieService,
  opts?: WbsBuildOptions
): Promise<Node[]> {
  const doc = await dexie.getDocument();
  return buildWbsTaskTree(doc, opts);
}

/**
 * Построить дерево WBS→TASK из IndexedDB (Dexie) ТОЛЬКО для указанного проекта.
 * Фильтрует PROJWBS, TASK, TASKPRED и TASKRSRC по proj_id, остальные справочники (RSRC/ROLE(S)) берёт целиком.
 */
export async function buildWbsTaskByProjectTreeFromIndexedDb(
  dexie: XerDexieService,
  projectId: number,
  opts?: WbsBuildOptions
): Promise<Node[]> {
  const pid = Number(projectId);

  // --- Считываем необходимые таблицы из Dexie ---
  const projwbsAll = await dexie.getRows('PROJWBS');
  const taskAll    = await dexie.getRows('TASK');
  const predAll    = await dexie.getRows('TASKPRED');
  const taskrsAll  = await dexie.getRows('TASKRSRC');
  const rsrcAll    = await dexie.getRows('RSRC');
  const rsrcRoleAll = await dexie.getRows('RSRCROLE'); // ВАЖНО: нужна для buildResourceIndex

  // --- Фильтры по проекту ---
  const wbsRows = projwbsAll.filter((r: any) => Number(r?.proj_id) === pid);
  const tasks   = taskAll.filter((r: any) => Number(r?.proj_id) === pid);
  const taskIdSet = new Set<number>(tasks.map((t: any) => Number(t?.task_id)));

  // Предшественники: либо помечены proj_id, либо относятся к задачам проекта
  const taskpred = predAll.filter((r: any) => {
    const belongsByProj = Number(r?.proj_id) === pid; // если в вашей схеме TASKPRED содержит proj_id
    const belongsByTask = taskIdSet.has(Number(r?.task_id));
    return belongsByProj || belongsByTask;
  });

  // Назначения ресурсов: по proj_id или по task_id множества задач проекта
  const taskrsrc = taskrsAll.filter((r: any) => {
    const byProj = Number(r?.proj_id) === pid;
    const byTask = taskIdSet.has(Number(r?.task_id));
    return byProj || byTask;
  });

  // --- Собираем минимальный XERDocument под билдер ---
  const makeTable = (name: string, rows: any[]) => ({
    name,
    fields: rows.length ? Object.keys(rows[0]) : [],
    rows,
  });

  const tables: XERDocument['tables'] = {
    PROJWBS:  makeTable('PROJWBS',  wbsRows),
    TASK:     makeTable('TASK',     tasks),
    TASKPRED: makeTable('TASKPRED', taskpred),
    TASKRSRC: makeTable('TASKRSRC', taskrsrc),
    RSRC:     makeTable('RSRC',     rsrcAll),
    RSRCROLE: makeTable('RSRCROLE', rsrcRoleAll), // ← вот это обеспечит подтяжку ролей/ресурсов
  };

  const doc: XERDocument = { header: null, tables };
  return buildWbsTaskTree(doc, opts);
}
