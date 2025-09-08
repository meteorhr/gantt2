// src/app/xer/models/rolelimit.model.ts
import { XERRowBase } from './base.model';

/** ROLELIMIT — Role Limits */
export interface ROLELIMITRow extends XERRowBase {

  /** Unique ID */           rolelimit_id: number;

  /** Role ID */             role_id?: number | null;
  /** Max Units / Time */    max_qty_per_hr?: number | null;
  /** Effective Date */      start_date?: Date | string | null;
}