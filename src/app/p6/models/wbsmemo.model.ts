// src/app/xer/models/wbsmemo.model.ts
import { XERRowBase } from './base.model';

/** WBSMEMO — EPS, Project and WBS Notebook */
export interface WBSMEMORow extends XERRowBase {

  /** Unique ID */            wbs_memo_id: number;
  /** WBS */                  wbs_id?: number | null;
  /** Project */              proj_id?: number | null;
  /** Notebook Topic */       memo_type_id?: number | null;
  /** Notebook Description */ wbs_memo?: string | null;
}
