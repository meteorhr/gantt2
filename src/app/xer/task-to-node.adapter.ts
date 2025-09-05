  // Дерево WBS → TASK как Node[] с правильной сортировкой по PROJWBS.seq_num
  // + опции переопределения родителей, + стабильная сортировка задач по task_code,
  // + порядок OPC: в одном родителе сначала задачи, затем вложенные WBS.

  import { Node, ResourceAssignment } from '../gantt/models/gantt.model';
  import { IsoDate } from '../gantt/models/gantt.types';
  import { TaskRow } from './models/task.model';
  import { TaskPredRow } from './models/taskpred.model';
  import { PROJWBSRow as WbsRow } from './models/index';
  import { buildResourceIndex } from './resources.adapter';
  import { XERDocument, XERScalar, getRows } from './xer-parser';


  type BaselineSource = 'target' | 'early' | 'none';


  export interface WbsBuildOptions {
    parentOverride?: Record<number, number | null>;
    parentOverrideByName?: Record<string, string | null>;
    baselineSource?: BaselineSource;
    debug?: boolean;
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
      const startAny =
        pickDate(t, 'early_start_date') ??
        pickDate(t, 'target_start_date') ??
        pickDate(t, 'act_start_date') ??
        pickDate(t, 'late_start_date') ??
        pickDate(t, 'expect_end_date');

      const finishAny =
        pickDate(t, 'early_end_date') ??
        pickDate(t, 'target_end_date') ??
        pickDate(t, 'act_end_date') ??
        pickDate(t, 'late_end_date') ??
        pickDate(t, 'expect_end_date');

      const startISO  = toIsoDateOrNull(startAny)  ?? toIsoDateOrNull(finishAny);
      const finishISO = toIsoDateOrNull(finishAny) ?? toIsoDateOrNull(startAny);
      if (!startISO || !finishISO) continue;

      const baselineStart =
        baselineSource === 'target' ? toIsoDateOrUndef(pickDate(t, 'target_start_date')) :
        baselineSource === 'early'  ? toIsoDateOrUndef(pickDate(t, 'early_start_date'))  :
        undefined;

      const baselineFinish =
        baselineSource === 'target' ? toIsoDateOrUndef(pickDate(t, 'target_end_date')) :
        baselineSource === 'early'  ? toIsoDateOrUndef(pickDate(t, 'early_end_date'))  :
        undefined;

      const complete = clamp0to100(numberOrNull(t['phys_complete_pct'])) ?? undefined; // <- индексация скобками, безопасно для XER
      const critical = typeof t.total_float_hr_cnt === 'number' ? t.total_float_hr_cnt <= 0 : false;
      const dependency = preds.get(t.task_id) ?? [];
      const resources = resIdx.get(t.task_id) ?? [];

      const taskNode: Node = {
        id: String(t.task_id),
        task_code: t.task_code ?? undefined,
        task_type: t.task_type ?? null,
        complete_pct_type: t.complete_pct_type ?? null,
        duration_type: t.duration_type ?? null,
        priority_type: t.priority_type ?? null,
        float_path: t.float_path ?? null,
        float_path_order: t.float_path_order ?? null,
        status_code: t.status_code ?? null, // <- оставьте только если это поле есть в Node
        name: t.task_name ?? t.task_code ?? `Task ${t.task_id}`,
        start: startISO,
        finish: finishISO,
        baselineStart,
        baselineFinish,
        complete,
        dependency,
        children: [],      // задачам детей не даём
        critical,
        resources: resources,   // <-- РЕСУРСЫ ТЕПЕРЬ В ДЕРЕВЕ
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
    rootWbsNodes.sort((a, b) => (a.seq - b.seq) || a.name.localeCompare(b.name));

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

    // 1) Задачи: по task_code (A1000, A1010, ...), затем по дате/имени
    taskKids.sort(byTaskSortKey);

    // 2) WBS-дети: по seq_num, затем по имени; рекурсивная финализация
    wbsKids.sort((a, b) => (a.seq - b.seq) || a.name.localeCompare(b.name));
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
    const ac = a.task_code ?? '';
    const bc = b.task_code ?? '';
    if (ac !== '' || bc !== '') {
      // Натуральная сортировка A1000 < A1010 < A1020 ...
      const cmp = ac.localeCompare(bc, undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.id.localeCompare(b.id);
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
      .sort((a, b) => (a.seq - b.seq) || a.wbsId - b.wbsId)
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