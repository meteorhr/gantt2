// src/app/xer/models/budgchng.model.ts
import { XERRowBase } from './base.model';

/** BUDGCHNG — Budget Changes */
export interface BUDGCHNGRow extends XERRowBase {

  /** Unique ID */             budg_chng_id: number;
  /** Responsible */           chng_by_name?: string | null;
  /** Amount */                chng_cost?: number | null;
  /** Date */                  chng_date?: Date | string | null;
  /** Reason */                chng_descr?: string | null;
  /** Change Number */         chng_short_name?: string | null;
  /** Project */               proj_id?: number | null;
  /** Status */                status_code?: string | number | null;
  /** WBS */                   wbs_id?: number | null;
}
