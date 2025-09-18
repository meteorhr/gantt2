// src/app/p6/services/dcma/src/check/check5.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck5Item, DcmaCheck5Result, TaskRow } from '../../models/dcma.model';
import { ConstraintNorm, isHardConstraint, normalizeConstraintType } from '../utils/constraint.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck5Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 5 — Hard Constraints (MS/MF) ≤ 5% среди всех ограничений */
  async analyzeCheck5(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck5Result> {
    const [taskRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const notWbs = tasksInProject.filter(t => !isWbs(t));
    const excludedWbs = tasksInProject.length - notWbs.length;

    // распределение по нормализованным типам
    const byType: Record<ConstraintNorm, number> = {
      HARD_MS: 0, HARD_MF: 0,
      SOFT_ALAP: 0, SOFT_ASAP: 0,
      SOFT_START_ON: 0, SOFT_START_ON_OR_BEFORE: 0, SOFT_START_ON_OR_AFTER: 0,
      SOFT_FINISH_ON: 0, SOFT_FINISH_ON_OR_BEFORE: 0, SOFT_FINISH_ON_OR_AFTER: 0,
      UNKNOWN: 0,
    };

    const itemsHard: DcmaCheck5Item[] = [];
    const itemsSoft: DcmaCheck5Item[] = [];

    let unknownType = 0;
    let missingDateForHard = 0;
    let missingDateForSoft = 0;

    for (const t of notWbs) {
      const norm = normalizeConstraintType((t as any).cstr_type);
      byType[norm] = (byType[norm] ?? 0) + 1;

      if (norm === 'UNKNOWN') { unknownType++; continue; }

      const hasDate = !!((t as any).cstr_date ?? null);
      const base: DcmaCheck5Item = {
        task_id: t.task_id,
        task_code: t.task_code,
        task_name: t.task_name,
        cstr_type: (t as any).cstr_type,
        cstr_date: (t as any).cstr_date,
        isHard: isHardConstraint(norm),
        normType: norm,
        hasDate,
      };

      if (isHardConstraint(norm)) {
        if (!hasDate) missingDateForHard++;
        itemsHard.push(base);
      } else {
        if (!hasDate) missingDateForSoft++;
        itemsSoft.push(base);
      }
    }

    const totalWithConstraints = itemsHard.length + itemsSoft.length;
    const hardCount = itemsHard.length;
    const softCount = itemsSoft.length;
    const hardPercent = totalWithConstraints > 0
      ? Math.round((hardCount / totalWithConstraints) * 10000) / 100
      : 0;

    return {
      proj_id: projId,
      totalWithConstraints,
      hardCount,
      softCount,
      hardPercent,
      threshold5PercentExceeded: hardPercent > 5,
      details: includeDetails ? {
        hardList: itemsHard,
        softList: itemsSoft,
        byType,
        dq: { unknownType, missingDateForHard, missingDateForSoft, excludedWbs },
      } : undefined,
    };
  }
}