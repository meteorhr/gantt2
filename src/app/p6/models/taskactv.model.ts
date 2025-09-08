// src/app/xer/models/taskactv.model.ts
import { XERRowBase } from './base.model';

/** TASKACTV — Activity Code Assignments */
export interface TASKACTVRow extends XERRowBase {

  /** Activity Code Value */  actv_code_id: number;
  /** Activity Code */        actv_code_type_id: number;
  /** Project */              proj_id?: number | null;
  /** Activity */             task_id: number;
}