import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck4NonFsItem, DcmaCheck4Result, TaskPredRow, TaskRow } from '../../models/dcma.model';
import { normalizeLinkType } from '../utils/link-type.util';

export type DcmaCheck4Options = {
  includeDetails?: boolean;
  detailsLimit?: number;

  ignoreMilestoneRelations?: boolean;
  ignoreLoERelations?: boolean;
  ignoreWbsSummaryRelations?: boolean;
  ignoreCompletedRelations?: boolean;

  dedupMode?: 'byType' | 'byTypeAndLag'; // ключ дедупликации
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck4Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 4 — Relationship Types: FS должно быть ≥ 90%. */
  async analyzeCheck4(
    projId: number,
    /** @deprecated — используйте options.includeDetails */
    includeDetails: boolean = true,
    options?: DcmaCheck4Options,
  ): Promise<DcmaCheck4Result> {
    const [taskRows, predRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
    ]);

    const includeDetailsEff = options?.includeDetails; //?? includeDetails;
    const dedup = options?.dedupMode ?? 'byType';

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));
    const taskById = new Map<number, TaskRow>();
    for (const t of tasksInProject) taskById.set(t.task_id, t);

    // утилита активностей
    const isMilestone = (t?: TaskRow): boolean => {
      const a = t as any; if (!a) return false;
      if (a?.remain_drtn_hr_cnt === 0 || a?.orig_drtn_hr_cnt === 0) return true;
      if (a?.orig_dur_hr_cnt === 0 || a?.remain_dur_hr_cnt === 0) return true;
      if (a?.task_type === 'MILESTONE' || a?.task_type === 1) return true;
      return false;
    };
    const isLoE = (t?: TaskRow): boolean => {
      const a = t as any;
      return a?.task_type === 'LOE' || a?.task_type === 2 || a?.task_code?.toString().includes('LOE');
    };
    const isWbsSummary = (t?: TaskRow): boolean => {
      const a = t as any;
      return a?.task_type === 'WBS_SUMMARY' || a?.task_type === 3;
    };
    const isCompleted = (t?: TaskRow): boolean => {
      const a = t as any;
      // типичные поля прогресса P6
      return a?.status === 'COMPLETED' || a?.complete_pct === 100 || a?.remain_drtn_hr_cnt === 0 && a?.act_work_qty > 0;
    };

    const seen = new Set<string>();
    let dqDuplicate = 0, dqSelf = 0, dqExternal = 0, dqUnknownType = 0;
    const linksInProject: TaskPredRow[] = [];
    const rawLinks = (predRows || []);

    for (const l of rawLinks) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;

      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) { dqExternal++; continue; }
      if (succId === predId) { dqSelf++; continue; }

      const tnorm = normalizeLinkType(l.pred_type);
      if (tnorm === 'UNKNOWN') { dqUnknownType++; }

      // фильтры по связям (по типу участвующих работ)
      if (options?.ignoreMilestoneRelations) {
        if (isMilestone(taskById.get(predId)) || isMilestone(taskById.get(succId))) continue;
      }
      if (options?.ignoreLoERelations) {
        if (isLoE(taskById.get(predId)) || isLoE(taskById.get(succId))) continue;
      }
      if (options?.ignoreWbsSummaryRelations) {
        if (isWbsSummary(taskById.get(predId)) || isWbsSummary(taskById.get(succId))) continue;
      }
      if (options?.ignoreCompletedRelations) {
        if (isCompleted(taskById.get(predId)) || isCompleted(taskById.get(succId))) continue;
      }

      // дедуп
      const keyByType = `${succId}|${predId}|${tnorm}`;
      const key =
        dedup === 'byTypeAndLag'
          ? `${keyByType}|${String(l.lag_hr_cnt ?? '')}|${String(l.lag_units ?? '')}|${String(l.lag_raw ?? '')}`
          : keyByType;

      if (seen.has(key)) { dqDuplicate++; continue; }
      seen.add(key);

      linksInProject.push({ ...l, pred_type: tnorm });
    }

    const totalRelationships = linksInProject.length;

    let countFS = 0, countSS = 0, countFF = 0, countSF = 0;
    for (const l of linksInProject) {
      const t = (l.pred_type as any) as 'FS' | 'SS' | 'FF' | 'SF' | 'UNKNOWN';
      if (t === 'FS') countFS++;
      else if (t === 'SS') countSS++;
      else if (t === 'FF') countFF++;
      else if (t === 'SF') countSF++;
    }

    const percentFS = Math.round(((totalRelationships > 0 ? (countFS / totalRelationships) * 100 : 0) * 100)) / 100;

    const nonFsList: DcmaCheck4NonFsItem[] = includeDetailsEff
      ? linksInProject
          .filter(l => (l.pred_type as any) !== 'FS')
          .slice(0, Math.max(0, options?.detailsLimit ?? Number.POSITIVE_INFINITY))
          .map(l => ({
            predecessor_task_id: l.pred_task_id,
            successor_task_id: l.task_id,
            predecessor_code: taskById.get(l.pred_task_id)?.task_code,
            successor_code: taskById.get(l.task_id)?.task_code,
            link_type: (l.pred_type as any) ?? 'UNKNOWN',
          }))
      : [];

    return {
      proj_id: projId,
      totalRelationships,
      countFS,
      countSS,
      countFF,
      countSF,
      percentFS,
      //fsThreshold90Failed: percentFS < 90, 
      details: includeDetailsEff ? {
        nonFsList,
        dq: { duplicateLinks: dqDuplicate, selfLoops: dqSelf, externalLinks: dqExternal, unknownType: dqUnknownType },
      } : undefined,
    };
  }
}