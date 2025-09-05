// src/app/xer/models/rolerate.model.ts
import { XERRowBase } from './base.model';
/** ROLERATE — Role Prices */
export interface ROLERATERow extends XERRowBase {

  /** Unique ID */           role_rate_id: number;
  /** Role ID */             role_id?: number | null;

  /** Standard Rate / Price1 */ cost_per_qty?: number | null;
  /** Price/Unit2 */            cost_per_qty2?: number | null;
  /** Price/Unit3 */            cost_per_qty3?: number | null;
  /** Price/Unit4 */            cost_per_qty4?: number | null;
  /** Price/Unit5 */            cost_per_qty5?: number | null;

  /** Max Units / Time */    max_qty_per_hr?: number | null;
  /** Effective Date */      start_date?: Date | string | null;
}