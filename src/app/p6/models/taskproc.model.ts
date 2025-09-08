// src/app/xer/models/taskproc.model.ts
import { XERRowBase } from './base.model';

/** TASKPROC — Activity Steps */
export interface TASKPROCRow extends XERRowBase {

  /** Unique ID */            proc_id: number;
  /** Project */              proj_id?: number | null;
  /** Activity */             task_id: number;

  /** Step Name */            proc_name?: string | null;
  /** Step Description */     proc_descr?: string | null;
  /** Sort Order */           seq_num?: number | null;
  /** Step Weight */          proc_wt?: number | null;

  /** Completed */            complete_flag?: string | number | null;
  /** Step % Complete */      complete_pct?: number | null;
}
