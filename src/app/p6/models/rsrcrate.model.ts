// src/app/xer/models/rsrcrate.model.ts
import { XERRowBase } from './base.model';

/** RSRCRATE — Resource Prices */
export interface RSRCRATERow extends XERRowBase {

  /** Unique ID */            rsrc_rate_id: number;
  /** Resource */             rsrc_id?: number | null;

  /** Standard Rate / Price1 */ cost_per_qty?: number | null;
  /** Price/Unit2 */           cost_per_qty2?: number | null;
  /** Price/Unit3 */           cost_per_qty3?: number | null;
  /** Price/Unit4 */           cost_per_qty4?: number | null;
  /** Price/Unit5 */           cost_per_qty5?: number | null;

  /** Max Units / Time */     max_qty_per_hr?: number | null;
  /** Shift */                shift_period_id?: number | null;
  /** Effective Date */       start_date?: Date | string | null;
}