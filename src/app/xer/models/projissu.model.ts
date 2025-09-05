// src/app/xer/models/projissu.model.ts
import { XERRowBase } from './base.model';

/** PROJISSU — Issues */
export interface PROJISSURow extends XERRowBase {

  /** Unique ID */                     issue_id: number;
  /** Project */                       proj_id?: number | null;
  /** WBS */                           wbs_id?: number | null;
  /** Activity */                      task_id?: number | null;

  /** Issue */                         issue_name?: string | null;
  /** Issue Notes */                   issue_notes?: string | null;

  /** Identified By */                 add_by_name?: string | null;
  /** Date Identified */               add_date?: Date | string | null;
  /** Resolution Date */               resolv_date?: Date | string | null;

  /** Base Project */                  base_proj_id?: number | null;
  /** Responsible Manager */           obs_id?: number | null;
  /** Resource */                      rsrc_id?: number | null;

  /** Priority */                      priority_type?: string | number | null;
  /** Status */                        status_code?: string | number | null;

  /** Threshold */                     thresh_id?: number | null;
  /** Threshold Parameter */           thresh_parm_id?: number | null;
  /** Tracking Layout */               track_view_id?: number | null;

  /** Actual Value */                  issue_value?: number | null;
  /** Lower Threshold */               lo_parm_value?: number | null;
  /** Upper Threshold */               hi_parm_value?: number | null;
}
