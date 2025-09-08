// src/app/xer/models/taskfin.model.ts
import { XERRowBase } from './base.model';

/** TASKFIN — Activity Past Period Actuals */
export interface TASKFINRow extends XERRowBase {

  /** Unique ID of period */  fin_dates_id: number;
  /** Project */              proj_id?: number | null;
  /** Activity Name */        task_id: number;

  /** Actual Nonlabor Cost */ act_equip_cost?: number | null;
  /** Actual Nonlabor Units */act_equip_qty?: number | null;
  /** Actual Expense Cost */  act_expense_cost?: number | null;
  /** Actual Material Cost */ act_mat_cost?: number | null;
  /** Actual Labor Cost */    act_work_cost?: number | null;
  /** Actual Labor Units */   act_work_qty?: number | null;

  /** Earned Value Cost */    bcwp?: number | null;
  /** Planned Value Cost */   bcws?: number | null;

  /** Earned Value Labor Units */ perfm_work_qty?: number | null;
  /** Planned Value Labor Units */ sched_work_qty?: number | null;
}