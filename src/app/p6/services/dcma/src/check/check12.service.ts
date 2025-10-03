// src/app/p6/services/dcma/src/check/check12.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck12Result, TaskPredRow, TaskRow, DcmaCheckItem } from '../../models/dcma.model';
import { isCriticalTaskRow } from '../../../../../state/p6-float.util';

export type DcmaCheck12Options = {
  floatThresholdHours?: number;
  simulatedDelayDays?: number;
  ignoreMilestoneActivities?: boolean;
  ignoreLoEActivities?: boolean;
  ignoreWbsSummaryActivities?: boolean;
  ignoreCompletedActivities?: boolean;
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck12Service {
  private readonly dexie = inject(P6DexieService);

  async analyzeCheck12(
    projId: number,
    includeDetails: boolean = true,
    options?: DcmaCheck12Options,
  ): Promise<DcmaCheck12Result> {
    const floatThresholdHoursOpt = options?.floatThresholdHours;
    const simulatedDelayDays = options?.simulatedDelayDays ?? 600;

    const [taskRows, predRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hpdFromCalendar = (cal: CALENDARRow | undefined | null): number | null => {
      if (!cal) return null;
      const h =
        (cal as any)?.hours_per_day_eff ??
        (cal as any)?.day_hr_cnt ??
        ((cal as any)?.week_hr_cnt != null ? (cal as any).week_hr_cnt / 5 : null) ??
        ((cal as any)?.month_hr_cnt != null ? (cal as any).month_hr_cnt / 21.667 : null) ??
        ((cal as any)?.year_hr_cnt != null ? (cal as any).year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : null;
    };
    const allHpds = (calRows || [])
      .map(c => hpdFromCalendar(c))
      .filter((v): v is number => typeof v === 'number' && v > 0)
      .sort((a,b) => a - b);
    const projectFallbackHpd = allHpds.length ? allHpds[Math.floor(allHpds.length/2)] : 8;

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // ===== Нормализация фильтров =====
    const normType = (t: TaskRow): string => (t.task_type ?? '').trim().toUpperCase();
    const isWbs = (t: TaskRow) => normType(t) === 'TT_WBS';
    const isMilestoneTy = (t: TaskRow) => {
      const ty = normType(t);
      return ty === 'TT_MILE' || ty === 'TT_STARTMILE' || ty === 'TT_FINMILE';
    };
    const isStartMilestoneTy = (t: TaskRow) => normType(t) === 'TT_STARTMILE';
    const isFinishMilestoneTy = (t: TaskRow) => normType(t) === 'TT_FINMILE';
    const isLoEOrHammock = (t: TaskRow) => {
      const ty = normType(t);
      return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
    };
    const isTemplate = (t: TaskRow) => {
      const ty = normType(t);
      return ty === 'TT_TMPL' || ty === 'TT_TMPLATE' || ty === 'TT_TMPLT';
    };
    const isInactive = (t: TaskRow) => String(t.status_code ?? '').toUpperCase() === 'TK_INACTIVE';
    const isCompleted = (t: TaskRow) => {
      const s = String(t.status_code ?? '').trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    // ===== Базовая выборка =====
    let baseTasks = tasksInProject.filter(t => !isInactive(t) && !isTemplate(t));
    if (options?.ignoreWbsSummaryActivities) baseTasks = baseTasks.filter(t => !isWbs(t));
    if (options?.ignoreMilestoneActivities)  baseTasks = baseTasks.filter(t => !isMilestoneTy(t));
    if (options?.ignoreLoEActivities)        baseTasks = baseTasks.filter(t => !isLoEOrHammock(t));
    if (options?.ignoreCompletedActivities)  baseTasks = baseTasks.filter(t => !isCompleted(t));

    const taskIdSet = new Set<number>(baseTasks.map(t => t.task_id));
    const taskById = new Map<number, TaskRow>(baseTasks.map(t => [t.task_id, t]));

    // Индекс календарей
    const calById = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById.set(c.clndr_id, c);
    const getHpd = (t: TaskRow): number => {
      const cal = t?.clndr_id != null ? calById.get(t.clndr_id) : undefined;
      const h = hpdFromCalendar(cal);
      return (typeof h === 'number' && h > 0) ? h : projectFallbackHpd;
    };

    // Порог TF
    const projectHpds = baseTasks.map(t => getHpd(t)).filter(h => typeof h === 'number' && h > 0).sort((a,b)=>a-b);
    const medianHpd = projectHpds.length ? projectHpds[Math.floor(projectHpds.length/2)] : projectFallbackHpd;
    const floatThresholdHours = floatThresholdHoursOpt ?? Math.max(1, Math.round(0.5 * medianHpd));

    // Критические
    const criticalTasksRows = baseTasks.filter(t => {
      const hpd = getHpd(t);
      const eps = Math.max(1, Math.round(hpd * 0.05));
      return isCriticalTaskRow(t as any, { hoursPerDay: hpd, epsilonHours: eps });
    });
    const criticalIds = new Set<number>(criticalTasksRows.map(t => t.task_id));

    // Граф только по критическим
    const seen = new Set<string>();
    let dqDuplicate = 0, dqSelf = 0, dqExternal = 0;
    const edges: Array<{ pred: number; succ: number }> = [];
    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) { dqExternal++; continue; }
      if (succId === predId) { dqSelf++; continue; }
      const key = `${succId}|${predId}`;
      if (seen.has(key)) { dqDuplicate++; continue; }
      seen.add(key);
      if (criticalIds.has(succId) && criticalIds.has(predId)) edges.push({ pred: predId, succ: succId });
    }

    const inDeg = new Map<number, number>();
    const outDeg = new Map<number, number>();
    for (const id of criticalIds) { inDeg.set(id, 0); outDeg.set(id, 0); }
    for (const e of edges) { inDeg.set(e.succ, (inDeg.get(e.succ) ?? 0) + 1); outDeg.set(e.pred, (outDeg.get(e.pred) ?? 0) + 1); }

    const startNodes = [...criticalIds].filter(id => (inDeg.get(id) ?? 0) === 0);
    const endNodes   = [...criticalIds].filter(id => (outDeg.get(id) ?? 0) === 0);

    // Компоненты
    const adj = new Map<number, number[]>(); const rev = new Map<number, number[]>();
    for (const id of criticalIds) { adj.set(id, []); rev.set(id, []); }
    for (const e of edges) { adj.get(e.pred)!.push(e.succ); rev.get(e.succ)!.push(e.pred); }

    const seenC = new Set<number>(); let components = 0;
    for (const id of criticalIds) {
      if (seenC.has(id)) continue; components++;
      const q: number[] = [id]; seenC.add(id);
      while (q.length) {
        const v = q.shift()!;
        for (const w of (adj.get(v) ?? [])) if (!seenC.has(w)) { seenC.add(w); q.push(w); }
        for (const w of (rev.get(v) ?? [])) if (!seenC.has(w)) { seenC.add(w); q.push(w); }
      }
    }

    // Дата PF (по EF/LF/AF)
    const toDate = (v: unknown): Date | null => { if (!v) return null; const d = (v instanceof Date) ? v : new Date(String(v)); return isNaN(d.getTime()) ? null : d; };
    const dayUTC_ = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    let projectForecastFinish: Date | null = null;
    for (const t of criticalTasksRows) {
      const ef = toDate((t as any).early_end_date) || toDate((t as any).late_end_date) || toDate((t as any).act_end_date);
      if (ef && (!projectForecastFinish || ef > projectForecastFinish)) projectForecastFinish = ef;
    }
    let reachedProjectFinish = false;
    if (projectForecastFinish) {
      const finishDay = dayUTC_(projectForecastFinish);
      for (const t of criticalTasksRows) {
        const ef = toDate((t as any).early_end_date) || toDate((t as any).late_end_date) || toDate((t as any).act_end_date);
        if (ef && dayUTC_(ef) === finishDay) { reachedProjectFinish = true; break; }
      }
    }

    const isSingleChain = (startNodes.length === 1 && endNodes.length === 1 && components === 1);

    // ===== Маппинг TaskRow -> DcmaCheckItem =====
    const hasPredByTask = new Map<number, boolean>();
    const hasSuccByTask = new Map<number, boolean>();
    for (const r of (predRows || [])) {
      if (typeof r.task_id === 'number') hasPredByTask.set(r.task_id, true);
      if (typeof r.pred_task_id === 'number') hasSuccByTask.set(r.pred_task_id, true);
    }

    const statusNorm = (t: TaskRow): DcmaCheckItem['status_norm'] => {
      const s = String(t.status_code ?? '').toUpperCase();
      if (s.includes('COMPLETE') || s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED') return 'COMPLETED';
      if (s.includes('NOT') || s.includes('PENDING') || s === 'TK_NOTSTARTED') return 'NOT_STARTED';
      if (s.includes('IN_PROGRESS') || s.includes('WIP') || s.includes('PROGRESS') || s.includes('STARTED')) return 'IN_PROGRESS';
      return 'UNKNOWN';
    };

    const toItem = (t: TaskRow): DcmaCheckItem => {
      const hasPred = !!hasPredByTask.get(t.task_id);
      const hasSucc = !!hasSuccByTask.get(t.task_id);
      const isMile  = isMilestoneTy(t);
      const rPred: DcmaCheckItem['reasonMissingPred'] =
        hasPred ? 'None' : (isStartMilestoneTy(t) ? 'StartMilestone' : 'None');
      const rSucc: DcmaCheckItem['reasonMissingSucc'] =
        hasSucc ? 'None' : (isFinishMilestoneTy(t) ? 'FinishMilestone' : 'None');

      return {
        task_id: t.task_id,
        task_code: (t as any).task_code ?? null,
        task_name: (t as any).task_name ?? null,
        wbs_id: (t as any).wbs_id ?? null,
        task_type: t.task_type ?? null,
        status_code: t.status_code ?? null,
        status_norm: statusNorm(t),
        hasPredecessor: hasPred,
        hasSuccessor: hasSucc,
        isMilestone: isMile,
        reasonMissingPred: rPred,
        reasonMissingSucc: rSucc,
        excludedFromEligible: false,
      };
    };

    const criticalTasksItems: DcmaCheckItem[] =
      includeDetails ? criticalTasksRows.map(toItem) : [];

    const startNodesOnCpItems: DcmaCheckItem[] =
      includeDetails ? startNodes.map(id => taskById.get(id)).filter((t): t is TaskRow => !!t).map(toItem) : [];

    const endNodesOnCpItems: DcmaCheckItem[] =
      includeDetails ? endNodes.map(id => taskById.get(id)).filter((t): t is TaskRow => !!t).map(toItem) : [];

    const result: DcmaCheck12Result = {
      proj_id: projId,
      simulatedDelayDays,
      criticalCount: criticalTasksRows.length,
      floatThresholdHours,
      startNodesOnCP: startNodes.length,
      endNodesOnCP: endNodes.length,
      isSingleChain,
      reachedProjectFinish,
      testPassLikely: isSingleChain && reachedProjectFinish && criticalTasksRows.length > 0,
      details: includeDetails ? {
        criticalTaskIds: [...criticalIds],
        criticalTasks: criticalTasksItems,
        startNodesOnCp: startNodesOnCpItems,
        endNodesOnCp: endNodesOnCpItems,
        dq: { duplicateLinks: dqDuplicate, selfLoops: dqSelf, externalLinks: dqExternal, components },
      } : undefined,
    };

    return result;
  }
}
