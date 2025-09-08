// src/app/xer/models/costtype.model.ts
import { XERRowBase } from './base.model';

/** COSTTYPE — Expense Categories */
export interface COSTTYPERow extends XERRowBase {

  /** Unique ID */             cost_type_id: number;
  /** Expense Category */      cost_type?: string | null;
  /** Sort Order */            seq_num?: number | null;
}