// src/app/xer/models/taskpred.model.ts
// TASKPRED — Activity Relationships
// Комментарии: "P6 EPPM Field  →  P6 EPPM Column Name (XER)"
// Важно: без undefined — только string | number | Date | null (XERScalar)

import { XERRowBase } from './base.model';
export interface TaskPredRow extends XERRowBase {
  /** Unique ID → task_pred_id */
  task_pred_id: number;

  /** Successor → task_id */
  task_id: number;

  /** Successor Project → proj_id */
  proj_id: number;

  /** Predecessor → pred_task_id */
  pred_task_id: number;

  /** Predecessor Project → pred_proj_id */
  pred_proj_id: number | null;

  /** Relationship Type → pred_type  (например: PR_FS, PR_SS, PR_FF, PR_SF) */
  pred_type: string | null;

  /** Lag → lag_hr_cnt  (в часах) */
  lag_hr_cnt: number | null;

  /** Comments → comments */
  comments: string | null;

  // Доп. поля, встречаются в части XER-экспортов P6 (см. ваш образец: float_path, aref, arls)
  /** Float Path → float_path */
  float_path: string | null;

  /** Relationship Early Finish (в экспортах обозначался как 'aref') → aref */
  aref: Date | string | null;

  /** Relationship Late Start (в экспортах обозначался как 'arls') → arls */
  arls: Date | string | null;
}