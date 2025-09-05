// src/app/xer/models/memotype.model.ts
import { XERRowBase } from './base.model';

/** MEMOTYPE — Notebook Topics */
export interface MEMOTYPERow extends XERRowBase {

  /** Unique ID */                memo_type_id: number;
  /** Notebook Topic */          memo_type?: string | null;

  /** Available for EPS */       eps_flag?: string | number | null;   // Y/N или 1/0
  /** Available for Projects */  proj_flag?: string | number | null;  // Y/N или 1/0
  /** Available for Activity */  task_flag?: string | number | null;  // Y/N или 1/0
  /** Available for WBS */       wbs_flag?: string | number | null;   // Y/N или 1/0

  /** Sort Order */              seq_num?: number | null;
}
