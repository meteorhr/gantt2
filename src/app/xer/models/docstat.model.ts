// src/app/xer/models/docstat.model.ts
import { XERRowBase } from './base.model';

/** DOCSTAT — Document Statuses */
export interface DOCSTATRow extends XERRowBase {

  /** Unique ID */    doc_status_id: number;
  /** Status Code */  doc_status_code?: string | number | null;
  /** Sort Order */   seq_num?: number | null;
}