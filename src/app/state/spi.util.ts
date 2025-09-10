import { P6DexieService } from '../p6/dexie.service';

export type SpiWeight = 'work' | 'equal';

export interface SpiResult {
  asOf: string | null;
  EV: number;
  PV: number;
  SPI: number | null;
  totalTasks: number;
  method: string;
}

/* ---------------- helpers ---------------- */
function pickProp<T = unknown>(obj: any, keys: string[]): T | undefined {
  if (!obj) return undefined as any;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k] as T;
    const found = Object.keys(obj).find(ok => ok.toLowerCase() === k.toLowerCase());
    if (found) return obj[found] as T;
  }
  return undefined as any;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v);
  const dt = new Date(s.replace(' ', 'T'));
  return isNaN(dt.getTime()) ? null : dt;
}

/** Плановая доля выполнения к asOf по интервалу [start,end]. */
function plannedFraction(asOf: Date, start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const t0 = start.getTime(), t1 = end.getTime(), t = asOf.getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return (t >= t1) ? 1 : 0;
  if (t <= t0) return 0;
  if (t >= t1) return 1;
  return (t - t0) / (t1 - t0);
}

const clamp0_100 = (x: number) => Math.max(0, Math.min(100, x));

/* ---------------- main ---------------- */
/**
 * weight='work': бюджет = Σ target_qty по ресурсам, иначе трудозатраты задачи (units), иначе часы длительности, иначе 1.
 * weight='equal': бюджет = 1.
 * PV: plannedFraction по PlannedStart/PlannedFinish.
 */
export async function computeSpiForProject(
  dexie: P6DexieService,
  projectId: number,
  opts?: { weight?: SpiWeight; asOf?: string | Date | null; debug?: boolean }
): Promise<SpiResult> {
  const pid = Number(projectId);
  const weightMode: SpiWeight = opts?.weight ?? 'work';

  /* -------- PROJECT.asOf -------- */
  const projRows = await dexie.getRows('PROJECT');
  const p = (projRows as any[]).find(r => Number(r?.proj_id) === pid) ?? null;

  const asOfStrCandidate =
    (p?.data_date ?? p?.next_data_date ?? p?.last_recalc_date ?? p?.last_tasksum_date ?? p?.update_date ?? null) as string | null;

  const asOfDate = opts?.asOf ? toDate(opts.asOf) : toDate(asOfStrCandidate);
  if (!asOfDate) {
    return { asOf: asOfStrCandidate, EV: 0, PV: 0, SPI: null, totalTasks: 0, method: 'no asOf date' };
  }

  /* -------- TASKS / TASKRSRC -------- */
  const taskRows = await dexie.getRows('TASK');
  const tasks = (taskRows as any[]).filter(t => Number(t?.proj_id) === pid);

  const trRows = await dexie.getRows('TASKRSRC');
  const byTask = new Map<number, any[]>();
  for (const r of (trRows as any[])) {
    if (Number(r?.proj_id) !== pid) continue;
    const tid = Number(r?.task_id);
    if (!Number.isFinite(tid)) continue;
    const arr = byTask.get(tid);
    if (arr) arr.push(r); else byTask.set(tid, [r]);
  }

  /* -------- выбрать % для EV -------- */
  const pickPercentForEV = (t: any): { pct: number; src: string } => {
    const phys  = toNum(pickProp(t, ['phys_complete_pct','PhysicalPercentComplete']));
    const dur   = toNum(pickProp(t, ['duration_pct_complete','DurationPercentComplete']));
    const units = toNum(pickProp(t, ['units_pct_complete','UnitsPercentComplete']));
    const pc    = toNum(pickProp(t, ['pct_complete','PercentComplete']));
    if (phys != null) return { pct: clamp0_100(phys), src: 'phys' };

    const pctType = String(pickProp(t, ['complete_pct_type','PercentCompleteType']) ?? '').toLowerCase();
    if (pctType.includes('phys'))      return { pct: clamp0_100((phys ?? pc ?? 0)), src: 'type=phys' };
    if (pctType.includes('drtn') || pctType.includes('duration'))
      return { pct: clamp0_100((dur ?? pc ?? 0)), src: 'type=drtn' };
    if (pctType.includes('unit'))      return { pct: clamp0_100((units ?? pc ?? 0)), src: 'type=units' };

    if (dur != null)   return { pct: clamp0_100(dur),   src: 'dur' };
    if (units != null) return { pct: clamp0_100(units), src: 'units' };
    return { pct: clamp0_100(pc ?? 0), src: 'pct_complete' };
  };

  /* -------- бюджет из ресурсов -------- */
  const budgetFromRsrcs = (rs: any[]): { val: number; src: string } => {
    let sum = 0;
    let usedTargets = 0;
    for (const r of rs) {
      const qTarget = toNum(pickProp(r, [
        'target_qty','TargetQty','at_complete_units','AtCompletionUnits','at_complete_qty',
        'budget_qty','BudgetQty','budget_units','BudgetUnits','planned_units','PlannedUnits'
      ]));

      if (qTarget != null && qTarget > 0) {
        sum += qTarget;
        usedTargets++;
        continue;
      }

      const remain = toNum(pickProp(r, ['remain_qty','RemainingUnits'])) ?? 0;
      const actReg = toNum(pickProp(r, ['act_reg_qty','ActualUnits'])) ?? 0;
      const actOT  = toNum(pickProp(r, ['act_ot_qty'])) ?? 0;
      const alt = remain + actReg + actOT;
      if (alt > 0) sum += alt;
    }
    if (sum > 0) return { val: sum, src: usedTargets > 0 ? 'rsrc:Σtarget' : 'rsrc:Σ(rem+act)' };
    return { val: 0, src: 'rsrc:none' };
  };

  /* -------- бюджет из задачи (без ?? на гарант-числах) -------- */
  const budgetFromTask = (t: any): { val: number; src: string } => {
    // 1) целевые трудозатраты/at-complete
    let qTask: number | null =
      toNum(pickProp(t, ['target_work_qty','TargetWorkQty','AtCompletionLaborUnits']));

    // 2) fallback: фактические + оставшиеся по задаче (если > 0)
    if (qTask == null) {
      const actUnits = toNum(pickProp(t, ['ActualLaborUnits'])) ?? 0;
      const remUnits = toNum(pickProp(t, ['RemainingLaborUnits'])) ?? 0;
      const sumUnits = actUnits + remUnits;
      if (sumUnits > 0) qTask = sumUnits;
    }

    // 3) fallback: плановые трудозатраты по задаче
    if (qTask == null) {
      const planUnits = toNum(pickProp(t, ['PlannedLaborUnits']));
      if (planUnits != null && planUnits > 0) qTask = planUnits;
    }

    if (qTask != null && qTask > 0) return { val: qTask, src: 'task:labor-units' };

    // 4) ещё один fallback: часы длительности
    let durH: number | null =
      toNum(pickProp(t, ['at_complete_drtn_hr_cnt','AtCompletionDuration','AtCompletionDurationHours']));
    if (durH == null) durH = toNum(pickProp(t, ['plan_drtn_hr_cnt','PlannedDuration','PlannedDurationHours'])) ?? null;
    if (durH == null) {
      const remH = toNum(pickProp(t, ['rem_drtn_hr_cnt','RemainingDuration','RemainingDurationHours'])) ?? 0;
      const actH = toNum(pickProp(t, ['act_total_drtn_hr_cnt','ActualDuration','ActualDurationHours'])) ?? 0;
      const sumH = remH + actH;
      if (sumH > 0) durH = sumH;
    }
    if (durH != null && durH > 0) return { val: durH, src: 'task:duration-hours' };

    // 5) крайний случай
    return { val: 1, src: 'task:fallback=1' };
  };

  let EV = 0, PV = 0;
  const dbg: any[] = [];

  for (const t of tasks) {
    const tid  = Number(t?.task_id);
    const code = String(t?.task_code ?? '');
    const rsrcs = byTask.get(tid) ?? [];

    // ---- бюджет ----
    let budget = 1, budgetSrc = 'equal=1';
    if (weightMode === 'work') {
      const br = budgetFromRsrcs(rsrcs);
      if (br.val > 0) { budget = br.val; budgetSrc = br.src; }
      else {
        const bt = budgetFromTask(t);
        budget = bt.val; budgetSrc = bt.src;
      }
    }

    // ---- EV ----
    const { pct, src: pctSrc } = pickPercentForEV(t);
    const EV_i = budget * (pct / 100);

    // ---- PV (по плановым датам активности) ----
    const tsTask =
      toDate(pickProp(t, ['plan_start_date','PlannedStart'])) ??
      toDate(pickProp(t, ['early_start_date'])) ??
      toDate(pickProp(t, ['start_date'])) ?? null;

    const teTask =
      toDate(pickProp(t, ['plan_end_date','PlannedFinish'])) ??
      toDate(pickProp(t, ['early_end_date'])) ??
      toDate(pickProp(t, ['end_date'])) ?? null;

    const pvFrac = plannedFraction(asOfDate, tsTask, teTask);
    const PV_i   = budget * pvFrac;

    EV += EV_i;
    PV += PV_i;

    if (opts?.debug) {
      dbg.push({
        code, task_id: tid,
        pctUsed: pct, pctSrc,
        budget, budgetSrc,
        EV_i,
        pvFrac, PV_i,
        planStart: tsTask ? tsTask.toISOString().slice(0,19) : null,
        planFinish: teTask ? teTask.toISOString().slice(0,19) : null
      });
    }
  }

  const SPI = PV > 0 ? (EV / PV) : null;

  if (opts?.debug) {
    // eslint-disable-next-line no-console
    console.log('[SPI] asOf=', asOfDate.toISOString().slice(0,10),
      'tasks=', tasks.length, 'EV=', EV, 'PV=', PV, 'SPI=', SPI, 'weight=', weightMode);
    // eslint-disable-next-line no-console
    console.table(dbg);
  }

  return {
    asOf: asOfDate.toISOString().slice(0, 10),
    EV,
    PV,
    SPI,
    totalTasks: tasks.length,
    method: weightMode === 'work'
      ? 'EV=percent * (ΣRSRC target | ΣRSRC(rem+act) | task.labor-units | task.duration-hours); PV=planned% (PlannedStart/Finish)'
      : 'EV=percent * 1; PV=planned% (PlannedStart/Finish)'
  };
}
