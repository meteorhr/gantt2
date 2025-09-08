// src/app/xer/models/tasknote.model.ts
import { XERRowBase } from './base.model';

/** TASKNOTE — Activity Notes to Resources */
export interface TASKNOTERow extends XERRowBase {

  /** Project */              proj_id?: number | null;
  /** Activity */             task_id?: number | null;
  /** Notes to Resources */   task_notes?: string | null;
}