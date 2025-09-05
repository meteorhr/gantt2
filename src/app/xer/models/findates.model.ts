// src/app/xer/models/findates.model.ts
import { XERRowBase } from './base.model';
/** FINDATES — Financial Periods */
export interface FINDATESRow extends XERRowBase {

  /** Unique ID */      fin_dates_id: number;
  /** Period Name */    fin_dates_name?: string | null;
  /** Start Date */     start_date?: Date | string | null;
  /** End Date */       end_date?: Date | string | null;
}