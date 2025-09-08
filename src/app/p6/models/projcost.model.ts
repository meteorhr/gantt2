// src/app/xer/models/projcost.model.ts
import { XERRowBase } from './base.model';

/** PROJCOST — Project Expenses */
export interface PROJCOSTRow extends XERRowBase {

  /** Unique ID */                 cost_item_id: number;
  /** Project */                   proj_id?: number | null;
  /** Activity Name */             task_id?: number | null;

  /** Expense Item */              cost_name?: string | null;
  /** Expense Description */       cost_descr?: string | null;
  /** Expense Category */          cost_type_id?: number | null;
  /** Cost Account */              acct_id?: number | null;
  /** Accrual Type */              cost_load_type?: string | number | null;

  /** Price / Unit */              cost_per_qty?: number | null;
  /** Unit of Measure */           qty_name?: string | null;

  /** Budgeted/Planned Units */    target_qty?: number | null;
  /** Budgeted/Planned Cost */     target_cost?: number | null;
  /** Remaining Cost */            remain_cost?: number | null;
  /** Actual Cost */               act_cost?: number | null;

  /** Auto Compute Actuals */      auto_compute_act_flag?: string | number | null;

  /** Vendor */                    vendor_name?: string | null;
  /** Document Number */           po_number?: string | null;
}
