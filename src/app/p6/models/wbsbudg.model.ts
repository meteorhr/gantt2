// src/app/xer/models/wbsbudg.model.ts
import { XERRowBase } from './base.model';

/** WBSBUDG — Spending and Benefit Plans */
export interface WBSBUDGRow extends XERRowBase {

  /** Unique ID */         wbs_budg_id: number;
  /** WBS */               wbs_id?: number | null;
  /** Project */           proj_id?: number | null;
  /** Date */              start_date?: Date | string | null;

  /** Spending Plan */     spend_cost?: number | null;
  /** Benefit Plan */      benefit_cost?: number | null;
}
