// src/app/xer/models/taskfdbk.model.ts
import { XERRowBase } from './base.model';

/** TASKFDBK — Activity Feedback */
export interface TASKFDBKRow extends XERRowBase {

  /** Project */              proj_id?: number | null;
  /** Feedback */             task_fdbk?: string | null;
  /** Activity */             task_id: number;
}
