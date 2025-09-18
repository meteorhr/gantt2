// src/app/p6/services/dcma/src/check/check12.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck12Result, TaskPredRow, TaskRow } from '../../models/dcma.model';
import { isCriticalTaskRow } from '../../../../../state/p6-float.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck12Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 12 — Critical Path Test (усиленная эвристика без пересчёта расписания).
   */
  async analyzeCheck12(
    projId: number,
    includeDetails: boolean = true,
    options?: { hoursPerDay?: number; floatThresholdHours?: number; simulatedDelayDays?: number },
  ): Promise<DcmaCheck12Result> {
    const hoursPerDayFallback = options?.hoursPerDay ?? 8;
    const floatThresholdHoursOpt = options?.floatThresholdHours;
    const simulatedDelayDays = options?.simulatedDelayDays ?? 600;

    const [taskRows, predRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Исключаем служебные типы из анализа КП
    const EXCLUDE_TYPES = new Set(['TT_WBS','TT_LOE','TT_HAMMOCK','TT_SUMMARY','TT_TMPL','TT_Tmpl']);
    const isExcludedType = (t: TaskRow) => EXCLUDE_TYPES.has(((t.task_type ?? '').trim().toUpperCase()));
    const baseTasks = tasksInProject.filter(t => !isExcludedType(t) && (t.status_code ?? '').toString().toUpperCase() !== 'TK_INACTIVE');

    const taskIdSet = new Set<number>(baseTasks.map(t => t.task_id));

    // Индекс календарей и HPD для задач
    const calById = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById.set(c.clndr_id, c);
    const getHpd = (t: TaskRow | undefined): number => {
      if (!t) return hoursPerDayFallback;
      const cal = t?.clndr_id != null ? calById.get(t.clndr_id) : undefined;
      const h =
        (cal as any)?.hours_per_day_eff ??
        (cal as any)?.day_hr_cnt ??
        ((cal as any)?.week_hr_cnt != null ? (cal as any).week_hr_cnt / 5 : null) ??
        ((cal as any)?.month_hr_cnt != null ? (cal as any).month_hr_cnt / 21.667 : null) ??
        ((cal as any)?.year_hr_cnt != null ? (cal as any).year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : hoursPerDayFallback;
    };

    // Порог по HPD (если не задан)
    const projectHpds = baseTasks.map(t => getHpd(t)).filter(h => typeof h === 'number' && h > 0).sort((a,b)=>a-b);
    const medianHpd = projectHpds.length ? projectHpds[Math.floor(projectHpds.length/2)] : hoursPerDayFallback;
    const floatThresholdHours = floatThresholdHoursOpt ?? Math.max(1, Math.round(0.5 * medianHpd));

    // Критические задачи через util с допуском
    const criticalTasks = baseTasks.filter(t => {
      const hpd = getHpd(t);
      const eps = Math.max(1, Math.round(hpd * 0.05));
      return isCriticalTaskRow(t as any, { hoursPerDay: hpd, epsilonHours: eps });
    });
    const criticalIds = new Set<number>(criticalTasks.map(t => t.task_id));

    // Построение подграфа по связям
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
      if (criticalIds.has(succId) && criticalIds.has(predId)) {
        edges.push({ pred: predId, succ: succId });
      }
    }

    // Входящие/исходящие
    const inDeg = new Map<number, number>();
    const outDeg = new Map<number, number>();
    for (const id of criticalIds) { inDeg.set(id, 0); outDeg.set(id, 0); }
    for (const e of edges) {
      inDeg.set(e.succ, (inDeg.get(e.succ) ?? 0) + 1);
      outDeg.set(e.pred, (outDeg.get(e.pred) ?? 0) + 1);
    }

    const startNodes = [...criticalIds].filter(id => (inDeg.get(id) ?? 0) === 0);
    const endNodes   = [...criticalIds].filter(id => (outDeg.get(id) ?? 0) === 0);

    // Компоненты связности в подграфе КП
    const adj = new Map<number, number[]>();
    const rev = new Map<number, number[]>();
    for (const id of criticalIds) { adj.set(id, []); rev.set(id, []); }
    for (const e of edges) { adj.get(e.pred)!.push(e.succ); rev.get(e.succ)!.push(e.pred); }

    const seenC = new Set<number>();
    let components = 0;
    for (const id of criticalIds) {
      if (seenC.has(id)) continue;
      components++;
      // BFS по неориентированному эквиваленту
      const q: number[] = [id];
      seenC.add(id);
      while (q.length) {
        const v = q.shift()!;
        for (const w of (adj.get(v) ?? [])) if (!seenC.has(w)) { seenC.add(w); q.push(w); }
        for (const w of (rev.get(v) ?? [])) if (!seenC.has(w)) { seenC.add(w); q.push(w); }
      }
    }

    // Проектный финиш (forecast) — максимум EF (fallback LF/AF), сравнение на уровне дня
    const toDate = (v: unknown): Date | null => {
      if (!v) return null; const d = (v instanceof Date) ? v : new Date(String(v)); return isNaN(d.getTime()) ? null : d;
    };
    const dayUTC_ = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

    let projectForecastFinish: Date | null = null;
    for (const t of criticalTasks) {
      const ef = toDate((t as any).early_end_date) || toDate((t as any).late_end_date) || toDate((t as any).act_end_date);
      if (ef && (!projectForecastFinish || ef > projectForecastFinish)) projectForecastFinish = ef;
    }

    let reachedProjectFinish = false;
    if (projectForecastFinish) {
      const finishDay = dayUTC_(projectForecastFinish);
      for (const t of criticalTasks) {
        const ef = toDate((t as any).early_end_date) || toDate((t as any).late_end_date) || toDate((t as any).act_end_date);
        if (ef && dayUTC_(ef) === finishDay) { reachedProjectFinish = true; break; }
      }
    }

    const isSingleChain = (startNodes.length === 1 && endNodes.length === 1 && components === 1);

    const result: DcmaCheck12Result = {
      proj_id: projId,
      simulatedDelayDays,
      criticalCount: criticalTasks.length,
      floatThresholdHours,
      startNodesOnCP: startNodes.length,
      endNodesOnCP: endNodes.length,
      isSingleChain,
      reachedProjectFinish,
      testPassLikely: isSingleChain && reachedProjectFinish && criticalTasks.length > 0,
      details: includeDetails ? {
        criticalTaskIds: [...criticalIds],
        dq: { duplicateLinks: dqDuplicate, selfLoops: dqSelf, externalLinks: dqExternal, components },
      } : undefined,
    };

    return result;
  }
}
