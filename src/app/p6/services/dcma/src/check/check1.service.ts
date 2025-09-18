import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import {
  DcmaCheck1Item,
  DcmaCheck1Options,
  DcmaCheck1Result,
  TaskPredRow,
  TaskRow,
  DcmaActivityFilters,
  DcmaThresholds,
} from '../../models/check1.model';
import { round2 } from '../utils/num.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck1Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * Анализ DCMA Check 1 (Logic) для заданного proj_id.
   */
  async analyzeCheck1(
    projId: number,
    opts: DcmaCheck1Options = {}
  ): Promise<DcmaCheck1Result> {
    // ===== Activity Filters defaults =====
    const afDefaults: DcmaActivityFilters = {
      taskResourceDependent: true,
      milestones: true,
      levelOfEffort: false,
      wbsSummary: false,
      completed: true,
      obsolete: true,
    };
    const af: DcmaActivityFilters = { ...afDefaults, ...(opts.activityFilters ?? {}) };

    // ===== Thresholds defaults (оба порога настраиваемые пользователем) =====
    const thDefaults: DcmaThresholds = { greatPct: 5, averagePct: 25 };
    const th: DcmaThresholds = { ...thDefaults, ...(opts.thresholds ?? {}) };
    // Санитизация порогов
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const greatRaw = Number.isFinite(th.greatPct) ? th.greatPct : 5;
    const avgRaw = Number.isFinite(th.averagePct) ? th.averagePct : 25;
    const greatClamped = clamp(greatRaw, 0, 100);
    const avgClamped = clamp(avgRaw, 0, 100);
    const thresholdGreatPct = Math.min(greatClamped, avgClamped);
    const thresholdAveragePct = Math.max(greatClamped, avgClamped);

    // ===== Исходные дефолты из старого кода =====
    const excludeTypesInput = opts.excludeTypes ?? ['TT_WBS'];
    const excludeTypes = new Set(Array.isArray(excludeTypesInput) ? excludeTypesInput : [...excludeTypesInput]);

    const milestoneTypesInput = opts.milestoneTypes ?? ['TT_Mile', 'TT_StartMile', 'TT_FinMile'];
    const milestoneTypes = new Set(Array.isArray(milestoneTypesInput) ? milestoneTypesInput : [...milestoneTypesInput]);

    const includeLists = opts.includeLists ?? true;

    // Эффективные флаги исключений с учётом Activity Filters
    const excludeCompletedEffective = (opts.excludeCompleted ?? false) || (af.completed === false);
    const excludeLoEAndHammockEffective = (opts.excludeLoEAndHammock ?? true) || (af.levelOfEffort === false);
    const wbsIncluded = af.wbsSummary === true;
    if (!wbsIncluded) excludeTypes.add('TT_WBS');

    const treatMilestonesAsExceptions = opts.treatMilestonesAsExceptions ?? true;
    const ignoreLoEAndHammockLinksInLogic = opts.ignoreLoEAndHammockLinksInLogic ?? false;
    const includeDQ = opts.includeDQ ?? true;

    const statusMap = opts.statusMap ?? {
      'NOT STARTED': 'NOT_STARTED',
      'IN PROGRESS': 'IN_PROGRESS',
      'COMPLETED': 'COMPLETED',
      'TK_COMPLETE': 'COMPLETED',
      'FINISHED': 'COMPLETED',
      'INACTIVE': 'UNKNOWN',
      'TK_INACTIVE': 'UNKNOWN',
      'OBSOLETE': 'UNKNOWN',
      'CANCELLED': 'UNKNOWN',
    };

    const statusObsoleteKeys = (opts.statusObsoleteKeys && opts.statusObsoleteKeys.length > 0)
      ? opts.statusObsoleteKeys.map(s => s.toUpperCase())
      : ['INACTIVE', 'TK_INACTIVE', 'OBSOLETE', 'CANCELLED'];

    // ===== Загрузка таблиц =====
    const [taskRows, predRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) {
      throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);
    }

    // ===== Индексы и DQ по всем связям =====
    const taskIdSet = new Set<number>((taskRows || []).filter(t => t.proj_id === projId).map(t => t.task_id));
    const allTaskIdSet = new Set<number>((taskRows || []).map(t => t.task_id));
    let dqDuplicateLinks = 0;
    let dqSelfLoops = 0;
    let dqOrphans = 0;

    const allPredBySucc = new Map<number, TaskPredRow[]>();
    const allSuccByPred = new Map<number, TaskPredRow[]>();
    const seenAll = new Set<string>();

    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      if (succId === predId) { dqSelfLoops++; continue; }
      const key = `${succId}|${predId}|${(l.pred_type ?? '').toString().trim()}|${String(l.lag_hr_cnt ?? '')}`;
      if (seenAll.has(key)) { dqDuplicateLinks++; continue; }
      seenAll.add(key);
      if (!allTaskIdSet.has(succId) || !allTaskIdSet.has(predId)) { dqOrphans++; }
      const ap = allPredBySucc.get(succId) ?? []; ap.push(l); allPredBySucc.set(succId, ap);
      const as = allSuccByPred.get(predId) ?? []; as.push(l); allSuccByPred.set(predId, as);
    }

    const predBySuccessor = new Map<number, TaskPredRow[]>();
    const succByPredecessor = new Map<number, TaskPredRow[]>();
    const seenInternal = new Set<string>();

    for (const link of (predRows || [])) {
      if (!link || typeof link.task_id !== 'number' || typeof link.pred_task_id !== 'number') continue;
      const succId = link.task_id;
      const predId = link.pred_task_id;
      if (succId === predId) continue; // self-loop игнорируем
      if (!taskIdSet.has(succId) || !taskIdSet.has(predId)) continue; // только внутри проекта
      const key = `${succId}|${predId}|${(link.pred_type ?? '').toString().trim()}|${String(link.lag_hr_cnt ?? '')}`;
      if (seenInternal.has(key)) continue; // дедупликация
      seenInternal.add(key);
      const arrPred = predBySuccessor.get(succId) ?? []; arrPred.push(link); predBySuccessor.set(succId, arrPred);
      const arrSucc = succByPredecessor.get(predId) ?? []; arrSucc.push(link); succByPredecessor.set(predId, arrSucc);
    }

    // ===== Helpers =====
    const normStatus = (s: unknown): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN' => {
      const key = (typeof s === 'string' ? s : String(s ?? '')).trim().toUpperCase();
      return statusMap[key] ?? 'UNKNOWN';
    };
    const isLoEOrHammockOrSummary = (t: TaskRow): boolean => {
      const ty = (t.task_type ?? '').trim().toUpperCase();
      return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
    };
    const isStartMilestone = (t: TaskRow): boolean => (t.task_type ?? '').trim() === 'TT_StartMile';
    const isFinishMilestone = (t: TaskRow): boolean => (t.task_type ?? '').trim() === 'TT_FinMile';
    const isMilestoneType = (t: TaskRow): boolean => milestoneTypes.has((t.task_type ?? '').trim());
    const isTaskOrResourceDependent = (t: TaskRow): boolean => {
      const ty = (t.task_type ?? '').trim().toUpperCase();
      return ty === 'TT_TASK' || ty === 'TT_RSRC' || ty === 'TT_RSRC_DEP' || ty === 'TT_RSRCDEPENDENT';
    };
    const isObsolete = (t: TaskRow): boolean => {
      const raw = (typeof t.status_code === 'string' ? t.status_code : String(t.status_code ?? '')).trim().toUpperCase();
      return statusObsoleteKeys.includes(raw);
    };

    const taskById = new Map<number, TaskRow>();
    for (const t of (taskRows || [])) if (t && typeof t.task_id === 'number') taskById.set(t.task_id, t);

    const counterpartIsOnlyLoEOrHammock = (links: TaskPredRow[], getOtherId: (l: TaskPredRow)=>number): boolean => {
      if (!links || links.length === 0) return false;
      let anyReal = false;
      for (const l of links) {
        const other = taskById.get(getOtherId(l));
        if (!other) continue;
        if (!isLoEOrHammockOrSummary(other)) { anyReal = true; break; }
      }
      return !anyReal; // true, если все противоположные — LOE/Hammock/Summary
    };

    // ===== Eligible: формирование знаменателя =====
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // 0) WBS summary: если фильтром не включены — исключаем
    let eligibleTasks = tasksInProject.filter(t => {
      const ty = (t.task_type ?? '').trim().toUpperCase();
      return !(excludeTypes.has(ty));
    });
    const totalEligibleRaw = eligibleTasks.length;

    // Счётчики исключений
    let excludedWbs = tasksInProject.length - eligibleTasks.length;
    let excludedCompleted = 0;
    let excludedLoEOrHammock = 0;
    let excludedByType: Record<string, number> = {};
    let excludedObsolete = 0;
    let excludedTaskResource = 0;
    let excludedMilestones = 0;

    // 1) Completed
    if (excludeCompletedEffective) {
      const keep = eligibleTasks.filter(t => normStatus(t.status_code) !== 'COMPLETED');
      excludedCompleted = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }

    // 2) Obsolete/Inactive
    if (af.obsolete === false) {
      const keep = eligibleTasks.filter(t => !isObsolete(t));
      excludedObsolete = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }

    // 3) LOE/Hammock/Summary
    if (excludeLoEAndHammockEffective) {
      const keep = eligibleTasks.filter(t => !isLoEOrHammockOrSummary(t));
      excludedLoEOrHammock = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }

    // 4) Task/Resource dependent выключены?
    if (af.taskResourceDependent === false) {
      const keep = eligibleTasks.filter(t => !isTaskOrResourceDependent(t));
      excludedTaskResource = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }

    // 5) Milestones выключены?
    if (af.milestones === false) {
      const keep = eligibleTasks.filter(t => !isMilestoneType(t));
      excludedMilestones = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }

    // 6) Доп. исключения по типам (явно переданным)
    if (excludeTypes.size) {
      const keep: TaskRow[] = [];
      for (const t of eligibleTasks) {
        const ty = (t.task_type ?? '').trim();
        if (excludeTypes.has(ty)) {
          excludedByType[ty] = (excludedByType[ty] ?? 0) + 1;
          continue;
        }
        keep.push(t);
      }
      eligibleTasks = keep;
    }

    // ===== Детализация =====
    const detailItems: DcmaCheck1Item[] = eligibleTasks.map(t => {
      const id = t.task_id;
      const predecessorsAll = allPredBySucc.get(id) ?? [];
      const successorsAll   = allSuccByPred.get(id) ?? [];

      const predecessors = predBySuccessor.get(id) ?? [];
      const successors   = succByPredecessor.get(id) ?? [];

      const hasExternalPred = predecessorsAll.length > 0 && (predecessors.length === 0);
      const hasExternalSucc = successorsAll.length > 0 && (successors.length === 0);

      let hasPred = predecessors.length > 0;
      let hasSucc = successors.length > 0;

      if (ignoreLoEAndHammockLinksInLogic) {
        if (hasPred && counterpartIsOnlyLoEOrHammock(predecessors, l => l.pred_task_id)) hasPred = false;
        if (hasSucc && counterpartIsOnlyLoEOrHammock(successors, l => l.task_id)) hasSucc = false;
      }

      const isMile = milestoneTypes.has((t.task_type ?? '').trim());
      const st = normStatus(t.status_code);

      let reasonPred: DcmaCheck1Item['reasonMissingPred'] = 'None';
      let reasonSucc: DcmaCheck1Item['reasonMissingSucc'] = 'None';

      if (!hasPred) {
        if (isStartMilestone(t)) reasonPred = 'StartMilestone';
        else if (hasExternalPred) reasonPred = 'ExternalLink';
        else if (isMile) reasonPred = 'ExceptionByRule';
      }
      if (!hasSucc) {
        if (isFinishMilestone(t)) reasonSucc = 'FinishMilestone';
        else if (hasExternalSucc) reasonSucc = 'ExternalLink';
        else if (isMile) reasonSucc = 'ExceptionByRule';
      }

      return {
        task_id: id,
        task_code: t.task_code,
        task_name: t.task_name,
        wbs_id: t.wbs_id,
        task_type: t.task_type,
        status_code: t.status_code,
        status_norm: st,
        hasPredecessor: hasPred,
        hasSuccessor: hasSucc,
        isMilestone: isMile,
        reasonMissingPred: reasonPred,
        reasonMissingSucc: reasonSucc,
        excludedFromEligible: false,
      };
    });

    // Нарушения с учётом исключений для вех
    const isPredViolation = (i: DcmaCheck1Item) =>
      !i.hasPredecessor && !(treatMilestonesAsExceptions && (i.reasonMissingPred === 'StartMilestone' || i.reasonMissingPred === 'ExceptionByRule'));
    const isSuccViolation = (i: DcmaCheck1Item) =>
      !i.hasSuccessor && !(treatMilestonesAsExceptions && (i.reasonMissingSucc === 'FinishMilestone' || i.reasonMissingSucc === 'ExceptionByRule'));

    const missingPredList = detailItems.filter(isPredViolation);
    const missingSuccList = detailItems.filter(isSuccViolation);
    const missingBothList = detailItems.filter(i => isPredViolation(i) && isSuccViolation(i));

    const totalEligible = detailItems.length;
    const missingAnySet = new Set<number>();
    for (const i of missingPredList) missingAnySet.add(i.task_id);
    for (const i of missingSuccList) missingAnySet.add(i.task_id);

    const uniqueMissingAny = missingAnySet.size;
    const percentMissingAny = totalEligible > 0 ? (uniqueMissingAny / totalEligible) * 100 : 0;

    // Исторический порог DCMA 5% в штуках
    const threshold5PercentValue = Math.ceil(totalEligible * 0.05);
    const threshold5PercentExceeded = percentMissingAny > 5;

    // Оценка производительности по пользовательским порогам
    let performance: 'Great' | 'Average' | 'Poor' = 'Poor';
    if (percentMissingAny <= thresholdGreatPct) performance = 'Great';
    else if (percentMissingAny <= thresholdAveragePct) performance = 'Average';

    const result: DcmaCheck1Result = {
      proj_id: projId,
      totalEligibleRaw,
      totalEligible,
      missingPredecessor: missingPredList.length,
      missingSuccessor: missingSuccList.length,
      missingBoth: missingBothList.length,
      uniqueMissingAny,
      percentMissingAny: round2(percentMissingAny),
      threshold5PercentValue,
      threshold5PercentExceeded,

      thresholdGreatPct,
      thresholdAveragePct,
      performance,

      appliedActivityFilters: af,

      details: includeLists ? {
        items: detailItems,
        missingPredList,
        missingSuccList,
        missingBothList,
        exclusions: {
          excludedWbs,
          excludedCompleted,
          excludedLoEOrHammock,
          excludedByType,
          excludedObsolete,
          excludedTaskResource,
          excludedMilestones,
        },
        dq: includeDQ ? {
          duplicateLinks: dqDuplicateLinks,
          selfLoops: dqSelfLoops,
          orphanLinks: dqOrphans,
        } : undefined,
      } : undefined,
    };

    return result;
  }
}
