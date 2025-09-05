// src/app/xer/models/calendar.model.ts
import { XERRowBase } from './base.model';

/** CALENDAR — Calendars */
export interface CALENDARRow extends XERRowBase {
  /** Parent Calendar */       base_clndr_id?: number | null;
  /** Data */                  clndr_data?: string | null;    // бинарные/текстовые данные календаря
  /** Unique ID */             clndr_id: number;
  /** Calendar Name */         clndr_name?: string | null;
  /** Calendar Type */         clndr_type?: string | number | null;
  /** Work Hours Per Day */    day_hr_cnt?: number | null;
  /** Default */               default_flag?: string | number | null; // 'Y'/'N' или 1/0
  /** Date Last Changed */     last_chng_date?: Date | string | null;
  /** Work Hours Per Month */  month_hr_cnt?: number | null;
  /** Project */               proj_id?: number | null;
  /** Personal Calendar */     rsrc_private?: string | number | null; // P6 EPPM only
  /** Work Hours Per Week */   week_hr_cnt?: number | null;
  /** Work Hours Per Year */   year_hr_cnt?: number | null;
}
