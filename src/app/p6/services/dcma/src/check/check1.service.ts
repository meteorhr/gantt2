// src/app/p6/services/dcma/src/check/check1.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck1Item, DcmaCheck1Options, DcmaCheck1Result, TaskPredRow, TaskRow } from '../../models/dcma.model';
import { round2 } from '../utils/num.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck1Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * Анализ DCMA Check 1 (Logic) для заданного proj_id.
   * Берём TASK, TASKPRED, при необходимости — PROJECT (для валидации наличия проекта).
   */
  async analyzeCheck1(
    projId: number,
    opts: DcmaCheck1Options = {}
  ): Promise<DcmaCheck1Result> {
    // Defaults
    const excludeTypes = new Set(
      opts.excludeTypes ?? [
        'TT_WBS',       // WBS Summary — исключаем из "eligible"
      ]
    );
    const milestoneTypes = new Set(
      opts.milestoneTypes ?? [
        'TT_Mile',
        'TT_StartMile',
        'TT_FinMile',
      ]
    );
    const includeLists = opts.includeLists ?? true;
    const excludeCompleted = opts.excludeCompleted ?? false;
    const excludeLoEAndHammock = opts.excludeLoEAndHammock ?? true;
    const treatMilestonesAsExceptions = opts.treatMilestonesAsExceptions ?? true;
    const statusMap = opts.statusMap ?? {
      'NOT STARTED': 'NOT_STARTED',
      'IN PROGRESS': 'IN_PROGRESS',
      'COMPLETED': 'COMPLETED',
      'TK_COMPLETE': 'COMPLETED',
      'FINISHED': 'COMPLETED',
    };

    // Загружаем необходимые таблицы
    const [taskRows, predRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
    ]);

    // Быстрая проверка на существование проекта
    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) {
      throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);
    }

    // После загрузки таблиц: taskIdSet и фильтрация связей только внутри проекта
    const taskIdSet = new Set<number>((taskRows || []).filter(t => t.proj_id === projId).map(t => t.task_id));

    // DQ статистика и карты «всех» связей (до фильтра по проекту)
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

    // Индексы связей: для быстрого поиска предшественников/преемников (только внутри проекта, с дедупликацией)
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

    const ignoreLoEAndHammockLinksInLogic = opts.ignoreLoEAndHammockLinksInLogic ?? false;
    const includeDQ = opts.includeDQ ?? true;

    // Helpers: статус, типы, milestone flags
    const normStatus = (s: unknown): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN' => {
      const key = (typeof s === 'string' ? s : String(s ?? '')).trim().toUpperCase();
      return statusMap[key] ?? 'UNKNOWN';
    };
    const isLoEOrHammock = (t: TaskRow): boolean => {
      const ty = (t.task_type ?? '').trim().toUpperCase();
      return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
    };
    const isStartMilestone = (t: TaskRow): boolean => (t.task_type ?? '').trim() === 'TT_StartMile';
    const isFinishMilestone = (t: TaskRow): boolean => (t.task_type ?? '').trim() === 'TT_FinMile';

    const taskById = new Map<number, TaskRow>();
    for (const t of (taskRows || [])) if (t && typeof t.task_id === 'number') taskById.set(t.task_id, t);

    const counterpartIsOnlyLoEOrHammock = (links: TaskPredRow[], getOtherId: (l: TaskPredRow)=>number): boolean => {
      if (!links || links.length === 0) return false;
      let anyReal = false;
      for (const l of links) {
        const other = taskById.get(getOtherId(l));
        if (!other) continue;
        if (!isLoEOrHammock(other)) { anyReal = true; break; }
      }
      return !anyReal; // true, если все противоположные — LOE/Hammock
    };

    // Eligible: two-phase, compute totalEligibleRaw before exclusions
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Сначала отсечём WBS
    let eligibleTasks = tasksInProject.filter(t => (t.task_type ?? '').trim() !== 'TT_WBS');
    const totalEligibleRaw = eligibleTasks.length;

    // Счётчики исключений
    let excludedWbs = tasksInProject.length - eligibleTasks.length;
    let excludedCompleted = 0;
    let excludedLoEOrHammock = 0;
    const excludedByType: Record<string, number> = {};

    // Правила исключений из знаменателя
    if (excludeCompleted) {
      const keep = eligibleTasks.filter(t => normStatus(t.status_code) !== 'COMPLETED');
      excludedCompleted = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }
    if (excludeLoEAndHammock) {
      const keep = eligibleTasks.filter(t => !isLoEOrHammock(t));
      excludedLoEOrHammock = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }
    if (excludeTypes.size) {
      eligibleTasks = eligibleTasks.filter(t => {
        const ty = (t.task_type ?? '').trim();
        if (excludeTypes.has(ty)) {
          excludedByType[ty] = (excludedByType[ty] ?? 0) + 1;
          return false;
        }
        return true;
      });
    }

    // Формируем detailItems с причинами/флагами
    const detailItems: DcmaCheck1Item[] = eligibleTasks.map(t => {
      const id = t.task_id;
      const predecessorsAll = allPredBySucc.get(id) ?? [];
      const successorsAll   = allSuccByPred.get(id) ?? [];

      const predecessors = predBySuccessor.get(id) ?? [];
      const successors   = succByPredecessor.get(id) ?? [];

      // Признак наличия внешних соседей (в полном наборе связей)
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

      // Исключён по правилам? — уже исключили выше
      const excludedFromEligible = false;

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
        excludedFromEligible,
      };
    });

    // Выделяем нарушения с учётом treatMilestonesAsExceptions
    const isPredViolation = (i: DcmaCheck1Item) => !i.hasPredecessor && !(treatMilestonesAsExceptions && (i.reasonMissingPred === 'StartMilestone' || i.reasonMissingPred === 'ExceptionByRule'));
    const isSuccViolation = (i: DcmaCheck1Item) => !i.hasSuccessor && !(treatMilestonesAsExceptions && (i.reasonMissingSucc === 'FinishMilestone' || i.reasonMissingSucc === 'ExceptionByRule'));

    const missingPredList = detailItems.filter(isPredViolation);
    const missingSuccList = detailItems.filter(isSuccViolation);
    const missingBothList = detailItems.filter(i => isPredViolation(i) && isSuccViolation(i));

    const totalEligible = detailItems.length; // после исключений
    const missingAnySet = new Set<number>();
    for (const i of missingPredList) missingAnySet.add(i.task_id);
    for (const i of missingSuccList) missingAnySet.add(i.task_id);

    const uniqueMissingAny = missingAnySet.size;
    const percentMissingAny = totalEligible > 0 ? (uniqueMissingAny / totalEligible) * 100 : 0;
    const threshold5PercentValue = Math.ceil(totalEligible * 0.05);
    const threshold5PercentExceeded = percentMissingAny > 5;

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
