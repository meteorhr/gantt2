// src/app/xer/models/shiftper.model.ts
import { XERRowBase } from './base.model';

/** SHIFTPER — Shifts */
export interface SHIFTPERRow extends XERRowBase {

  /** Unique ID */            shift_period_id: number;
  /** Shift Name */           shift_id?: number | null;
  /** Shift start hour number */ shift_start_hr_num?: number | null;
}
