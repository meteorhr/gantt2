import { XERRowBase } from './base.model';

/** DOCCATG — Document Categories */
export interface DOCCATGRow extends XERRowBase {

  /** Unique ID */   doc_catg_id: number;
  /** Category */    doc_catg_name?: string | null;
  /** Sort Order */  seq_num?: number | null;
}