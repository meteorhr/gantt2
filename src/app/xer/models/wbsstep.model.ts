// src/app/xer/models/wbsstep.model.ts

import { XERRowBase } from './base.model';

/** WBSSTEP — WBS Milestones */
export interface WBSSTEPRow extends XERRowBase {

  /** Unique ID */   wbs_step_id: number;
  /** WBS */         wbs_id?: number | null;
  /** Project ID */  proj_id?: number | null;

  /** WBS Milestone */ step_name?: string | null;
  /** Sort Order */    seq_num?: number | null;
  /** Weight */        step_wt?: number | null;

  /** Completed */     complete_flag?: string | number | null;
}