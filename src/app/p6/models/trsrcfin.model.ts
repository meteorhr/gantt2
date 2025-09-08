// src/app/xer/models/trsrcfin.model.ts
import { XERRowBase } from './base.model';

/** TRSRCFIN — Activity Resource Assignment Past Period Actuals */
export interface TRSRCFINRow extends XERRowBase {

  /** Assignment ID */        taskrsrc_id: number;
  /** Financial Period */     fin_dates_id: number;
  /** Project */              proj_id?: number | null;
  /** Activity Name */        task_id: number;

  /** Actual Cost */          act_cost?: number | null;
  /** Actual Units */         act_qty?: number | null;
}
