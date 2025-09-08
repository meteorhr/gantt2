// src/app/xer/models/projthrs.model.ts
import { XERRowBase } from './base.model';

/** PROJTHRS — Thresholds */
export interface PROJTHRSRow extends XERRowBase {

  /** Unique ID */            thresh_id: number;

  /** Project */              proj_id?: number | null;
  /** WBS */                  wbs_id?: number | null;

  /** Threshold Parameter */  thresh_parm_id?: number | null;
  /** Detail To Monitor */    thresh_type?: string | null;
  /** Tracking Layout */      track_view_id?: number | null;

  /** Responsible Manager */  obs_id?: number | null;
  /** Priority */             priority_type?: string | number | null;
  /** Status */               status_code?: string | number | null;

  /** Lower Threshold */      lo_parm_value?: number | null;
  /** Upper Threshold */      hi_parm_value?: number | null;

  /** From Date */            window_start?: Date | string | null;
  /** To Date */              window_end?: Date | string | null;
}
