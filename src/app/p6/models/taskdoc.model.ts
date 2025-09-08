// src/app/xer/models/taskdoc.model.ts
import { XERRowBase } from './base.model';

/** TASKDOC — Document Assignments */
export interface TASKDOCRow extends XERRowBase {

  /** Unique ID */            taskdoc_id: number;
  /** Document */             doc_id?: number | null;
  /** Project */              proj_id?: number | null;
  /** Activity */             task_id?: number | null;
  /** WBS */                  wbs_id?: number | null;
  /** Work Product */         wp_flag?: string | number | null;
}