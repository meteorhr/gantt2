// src/app/p6/services/dcma/src/check/check4.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck4NonFsItem, DcmaCheck4Result, TaskPredRow, TaskRow } from '../../models/dcma.model';
import { normalizeLinkType } from '../utils/link-type.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck4Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 4 — Relationship Types: FS должно быть ≥ 90%. */
  async analyzeCheck4(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck4Result> {
    const [taskRows, predRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));
    const taskById = new Map<number, TaskRow>();
    for (const t of tasksInProject) taskById.set(t.task_id, t);

    const seen = new Set<string>();
    let dqDuplicate = 0, dqSelf = 0, dqExternal = 0, dqUnknownType = 0;
    const linksInProject: TaskPredRow[] = [];
    const rawLinks = (predRows || []);

    for (const l of rawLinks) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      const t = normalizeLinkType(l.pred_type);

      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) { dqExternal++; continue; }
      if (succId === predId) { dqSelf++; continue; }

      // дедуп по (succ|pred|type)
      const key = `${succId}|${predId}|${t}`;
      if (seen.has(key)) { dqDuplicate++; continue; }
      seen.add(key);

      linksInProject.push({ ...l, pred_type: t });
      if (t === 'UNKNOWN') dqUnknownType++;
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

    const nonFsList: DcmaCheck4NonFsItem[] = includeDetails
      ? linksInProject
          .filter(l => (l.pred_type as any) !== 'FS')
          .map(l => ({
            predecessor_task_id: l.pred_task_id,
            successor_task_id: l.task_id,
            predecessor_code: taskById.get(l.pred_task_id)?.task_code,
            successor_code: taskById.get(l.task_id)?.task_code,
            link_type: (l.pred_type as any) ?? 'UNKNOWN',
          }))
      : [];

    const percentFS = Math.round(((totalRelationships > 0 ? (countFS / totalRelationships) * 100 : 0) * 100)) / 100;

    return {
      proj_id: projId,
      totalRelationships,
      countFS,
      countSS,
      countFF,
      countSF,
      percentFS,
      fsThreshold90Failed: (totalRelationships > 0 ? (countFS / totalRelationships) * 100 : 0) < 90,
      details: includeDetails ? { 
        nonFsList,
        dq: { duplicateLinks: dqDuplicate, selfLoops: dqSelf, externalLinks: dqExternal, unknownType: dqUnknownType },
      } : undefined,
    };
  }
}
