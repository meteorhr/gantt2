// src/app/xer/models/issuhist.model.ts
import { XERRowBase } from './base.model';

/** ISSUHIST — Notification History */
export interface ISSUHISTRow extends XERRowBase {

  /** Issue */                 issue_id: number;
  /** Project */               proj_id?: number | null;
  /** Notification History */  issue_history?: string | null;
}
