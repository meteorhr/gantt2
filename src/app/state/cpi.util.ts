// src/app/state/cpi.util.ts
import { P6DexieService } from '../p6/dexie.service';

export interface CPIvm {
  EV: number | null;   // Earned Value
  AC: number | null;   // Actual Cost
  CPI: number | null;  // EV / AC
  method: string;      // описание применённого метода/полей
  asOf: string | null; // дата отчётности
}

export interface ComputeCPIOptions {
  /** синонимы BAC/target на уровне назначений */
  targetCostKeys?: string[];
  /** синонимы AC на уровне назначений */
  actualCostKeys?: string[];
  /** поле % на TASK (0..100), по умолчанию phys_complete_pct */
  taskProgressField?: string;
  debug?: boolean;
}

/* ---------- helpers ---------- */
function toIsoDateOrNull(input: any): string | null {
  if (!input) return null;
  if (input instanceof Date && !isNaN(input.getTime())) return input.toISOString().slice(0, 10);
  const s = String(input).trim();
  // быстрый путь YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(s.replace(' ', 'T'));
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function isYes(flag: any): boolean {
  const s = String(flag ?? '').trim().toLowerCase();
  return s === 'y' || s === 'yes' || s === '1' || s === 'true';
}
/** взять число по набору ключей (case-insensitive) */
function pickNum(row: any, keys: string[]): number | null {
  for (const k of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, k)) {
      const n = toNumberOrNull(row[k]);
      if (n != null) return n;
    }
    if (row) {
      const found = Object.keys(row).find((ok) => ok.toLowerCase() === k.toLowerCase());
      if (found) {
        const n = toNumberOrNull(row[found]);
        if (n != null) return n;
      }
    }
  }
  return null;
}
/** безопасная сумма (если оба null — вернёт null) */
function sumIfAny(a: number | null, b: number | null): number | null {
  const hasA = a !== null && a !== undefined;
  const hasB = b !== null && b !== undefined;
  if (!hasA && !hasB) return null;
  return (hasA ? (a as number) : 0) + (hasB ? (b as number) : 0);
}
/** первое не-null/undefined значение */
function firstNonNull<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) if (v !== null && v !== undefined) return v as T;
  return null;
}

/* ---------- qty/rate helpers ---------- */
function actualQtyOf(r: any): number {
  const reg = toNumberOrNull(r?.act_reg_qty) ?? toNumberOrNull(r?.ActualRegularUnits) ?? 0;
  const ot  = toNumberOrNull(r?.act_ot_qty)  ?? toNumberOrNull(r?.ActualOvertimeUnits) ?? 0;
  const sum = reg + ot;
  if (sum > 0) return sum;
  const single = toNumberOrNull(r?.actual_qty) ?? toNumberOrNull(r?.ActualUnits) ?? 0;
  return Number.isFinite(single) ? single : 0;
}
function remainQtyOf(r: any): number | null {
  return toNumberOrNull(r?.remain_qty) ?? toNumberOrNull(r?.RemainingUnits) ?? null;
}
function targetQtyOf(r: any): number | null {
  return (
    toNumberOrNull(r?.target_qty) ??
    toNumberOrNull(r?.TargetQty) ??
    toNumberOrNull(r?.BudgetUnits) ??
    toNumberOrNull(r?.PlannedUnits) ??
    toNumberOrNull(r?.AtCompletionUnits) ??
    null
  );
}
function costPerQtyOf(r: any): number | null {
  return (
    toNumberOrNull(r?.cost_per_qty) ??
    toNumberOrNull(r?.CostPerQty) ??
    toNumberOrNull(r?.CostPerUnit) ??
    toNumberOrNull(r?.UnitPrice) ??
    toNumberOrNull(r?.PricePerUnit) ??
    toNumberOrNull(r?.Rate) ??
    null
  );
}

/* ---------- AC/BAC per assignment ---------- */
function computeAssignmentAC(r: any, actualCostKeysFallback: string[]): number {
  // 1) раздельные AC (регуляр + овертайм)
  const actReg = toNumberOrNull(r?.act_reg_cost) ?? toNumberOrNull(r?.ActualRegularCost);
  const actOt  = toNumberOrNull(r?.act_ot_cost)  ?? toNumberOrNull(r?.ActualOvertimeCost);
  const hasSplit = (actReg ?? 0) !== 0 || (actOt ?? 0) !== 0;
  if (hasSplit) {
    const sum = (actReg ?? 0) + (actOt ?? 0);
    if (Number.isFinite(sum) && sum !== 0) return sum;
  }

  // 2) единое поле AC
  const singleAC1 = pickNum(r, actualCostKeysFallback);
  const singleAC2 = pickNum(r, ['ActualTotalCost','ActualCost','act_total_cost','act_cost']);
  const singleAC = firstNonNull(singleAC1, singleAC2);
  if (singleAC != null) return singleAC;

  // 3) qty × rate
  const cpq = costPerQtyOf(r);
  if (cpq != null) {
    const aq = actualQtyOf(r);
    if (aq > 0) return cpq * aq;
  }
  return 0;
}

function computeAssignmentBAC(
  r: any,
  targetCostKeys: string[],
  actualCostKeysFallback: string[]
): number | null {
  // 1) прямые target-поля
  const direct1 = pickNum(r, targetCostKeys);
  const direct2 = pickNum(r, [
    'AtCompletionCost','TargetCost','PlannedCost','BudgetCost',
    'AtCompletionTotalCost','PlannedTotalCost','BudgetTotalCost','target_total_cost'
  ]);
  const direct = firstNonNull(direct1, direct2);
  if (direct != null) return direct;

  // 2) qty × rate (с/без связки)
  const cpq  = costPerQtyOf(r);
  const link = isYes(r?.cost_qty_link_flag) || isYes(r?.CostQtyLinkFlag);

  if (cpq != null) {
    const t   = targetQtyOf(r);
    const rem = remainQtyOf(r);
    const act = actualQtyOf(r);

    if (link && t != null) return t * cpq;
    if (link && rem != null) return (rem + act) * cpq;

    // без link — осторожные попытки
    if (t != null) return t * cpq;
    if (rem != null) return (rem + act) * cpq;
  }

  // 3) приближение: remain_cost + AC
  const remCost = pickNum(r, ['remain_cost','RemainingCost']);
  if (remCost != null) {
    const ac = computeAssignmentAC(r, actualCostKeysFallback);
    if (Number.isFinite(ac)) return remCost + ac;
  }

  return null;
}

/* ---------- core ---------- */
export function computeCPI(
  projectRow: any | null,
  taskRows: any[],
  taskRsrcRows: any[],
  opts?: ComputeCPIOptions
): CPIvm {
  const targetCostKeys = opts?.targetCostKeys ?? [
    'target_cost', 'target_total_cost', 'target_cost_sum',
    'at_completion_total_cost', 'cost_at_completion'
  ];
  const actualCostKeysFallback = opts?.actualCostKeys ?? [
    'act_total_cost','act_cost','actual_cost'
  ];
  const taskProgressField = opts?.taskProgressField ?? 'phys_complete_pct';

  // % по задачам (0..1) — phys/dur/units/%Complete
  const taskPct = new Map<number, number>();
  for (const t of taskRows) {
    const id = toNumberOrNull(t?.task_id);
    if (!Number.isFinite(id as number)) continue;

    const phys = toNumberOrNull(t?.[taskProgressField]);
    const dur  = pickNum(t, ['duration_pct_complete','DurationPercentComplete']);
    const units= pickNum(t, ['units_pct_complete','UnitsPercentComplete']);
    const gen  = pickNum(t, ['pct_complete','PercentComplete']);
    const pct  = firstNonNull(phys, dur, units, gen) ?? 0;

    taskPct.set(id as number, clamp01((pct as number) / 100));
  }

  // группировка назначений по task
  const byTask = new Map<number, any[]>();
  for (const r of taskRsrcRows) {
    const tid = toNumberOrNull(r?.task_id);
    if (!Number.isFinite(tid as number)) continue;
    if (!byTask.has(tid as number)) byTask.set(tid as number, []);
    byTask.get(tid as number)!.push(r);
  }

  let EV = 0;
  let AC = 0;
  const dbg: any[] = [];

  for (const t of taskRows) {
    const tid = toNumberOrNull(t?.task_id);
    if (!Number.isFinite(tid as number)) continue;
    const pct = taskPct.get(tid as number) ?? 0;

    // 1) через назначения
    let BAC_assign = 0;
    let AC_assign  = 0;
    const rs = byTask.get(tid as number) ?? [];
    for (const r of rs) {
      const bac_i = computeAssignmentBAC(r, targetCostKeys, actualCostKeysFallback);
      if (bac_i != null && bac_i > 0) BAC_assign += bac_i;

      const ac_i = computeAssignmentAC(r, actualCostKeysFallback);
      if (ac_i > 0) AC_assign += ac_i;
    }

    let usedSource = 'assignments';

    // 2) fallback на уровень TASK, если по назначениям пусто
    if (BAC_assign <= 0 && AC_assign <= 0) {
      const plannedTotal = pickNum(t, ['planned_total_cost','PlannedTotalCost']);
      const plannedSum   = sumIfAny(
        pickNum(t, ['planned_labor_cost','PlannedLaborCost']),
        pickNum(t, ['planned_nonlabor_cost','PlannedNonLaborCost'])
      );

      const atcTotal = pickNum(t, ['at_completion_total_cost','AtCompletionTotalCost']);
      const atcSum   = sumIfAny(
        pickNum(t, ['at_completion_labor_cost','AtCompletionLaborCost']),
        pickNum(t, ['at_completion_nonlabor_cost','AtCompletionNonLaborCost'])
      );

      const taskBAC = firstNonNull(plannedTotal, plannedSum, atcTotal, atcSum);

      const actualTotal1 = pickNum(t, ['actual_total_cost','ActualTotalCost','ActTotalCost','ActualCost']);
      const actualTotal2 = sumIfAny(
        pickNum(t, ['actual_labor_cost','ActualLaborCost']),
        pickNum(t, ['actual_nonlabor_cost','ActualNonLaborCost'])
      );
      const actualTotal = firstNonNull(actualTotal1, actualTotal2);

      if ((taskBAC ?? 0) > 0 || (actualTotal ?? 0) > 0) {
        BAC_assign = (taskBAC ?? 0);
        AC_assign  = (actualTotal ?? 0);
        usedSource = 'task-level';
      }
    }

    const EV_i = BAC_assign * pct;
    EV += EV_i;
    AC += AC_assign;

    if (opts?.debug) {
      dbg.push({
        task: t?.task_code ?? t?.task_id,
        usedSource,
        pct: (pct * 100).toFixed(2),
        BAC_used: BAC_assign,
        AC_used: AC_assign,
        EV_i
      });
    }
  }

  const CPI = AC > 0 ? EV / AC : null;

  // -------- PROJECT.asOf (как в SPI) --------
  const asOfStrCandidate = projectRow
    ? (projectRow.data_date ??
       projectRow.next_data_date ??
       projectRow.last_recalc_date ??
       projectRow.last_tasksum_date ??
       projectRow.update_date ??
       null)
    : null;
  const asOf = toIsoDateOrNull(asOfStrCandidate);

  const method = [
    'EV = Σ( percent(TASK) × BAC ), percent = phys/dur/units/%Complete (0..100)',
    'BAC/AC сначала по TASKRSRC; если пусто — берём с TASK:',
    '  BAC: PlannedTotalCost | (PlannedLaborCost + PlannedNonLaborCost) | AtCompletionTotalCost | (AtCompletionLaborCost + AtCompletionNonLaborCost)',
    '  AC: ActualTotalCost | (ActualLaborCost + ActualNonLaborCost)',
    'Назначения: BAC = TargetCost | qty×rate (target | remain+actual) | remain_cost + AC; AC = ActualRegular+Overtime | ActualTotalCost | qty×rate(actuals)'
  ].join(' | ');

  if (opts?.debug) {
    // eslint-disable-next-line no-console
    console.table(dbg);
    // eslint-disable-next-line no-console
    console.log('[CPI]', { asOf, EV, AC, CPI });
  }

  return { EV: EV >= 0 ? EV : null, AC: AC > 0 ? AC : null, CPI, method, asOf };
}

/* ---------- wrapper ---------- */
export async function computeCPIFromDexie(
  dexie: P6DexieService,
  projectId: number,
  opts?: ComputeCPIOptions
): Promise<CPIvm> {
  const pid = Number(projectId);

  const projectRows = await dexie.getRows('PROJECT');
  const project = ((projectRows as any[]) ?? []).find((r) => Number(r?.proj_id) === pid) ?? null;

  const taskRowsAll = await dexie.getRows('TASK');
  const tasks = ((taskRowsAll as any[]) ?? []).filter((t) => Number(t?.proj_id) === pid);

  const trAll = await dexie.getRows('TASKRSRC');
  const taskRsrc = ((trAll as any[]) ?? []).filter((r) => Number(r?.proj_id) === pid);

  return computeCPI(project, tasks, taskRsrc, opts);
}
