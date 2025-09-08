// src/app/xer/models/taskuser.model.ts
import { XERRowBase } from './base.model';

/** TASKUSER — Activity Owners */
export interface TASKUSERRow extends XERRowBase {

  /** Project */              proj_id?: number | null;
  /** Activity Name */        task_id?: number | null;
  /** Owner (login) */        user_id?: string | null;
}