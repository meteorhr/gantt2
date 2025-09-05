// src/app/xer/models/taskmemo.model.ts
import { XERRowBase } from './base.model';

/** TASKMEMO — Activity Notebook */
export interface TASKMEMORow extends XERRowBase {

  /** Unique ID */            memo_id: number;
  /** Notebook Topic */      memo_type_id?: number | null;
  /** Project */             proj_id?: number | null;
  /** Activity */            task_id?: number | null;
  /** Notebook Description */task_memo?: string | null;
}