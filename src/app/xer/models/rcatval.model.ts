// src/app/xer/models/rcatval.model.ts
import { XERRowBase } from './base.model';

/** RCATVAL — Resource Code Values */
export interface RCATVALRow extends XERRowBase {

  /** Unique ID */           rsrc_catg_id: number;
  /** Resource Code */       rsrc_catg_type_id?: number | null;

  /** Resource Code */       rsrc_catg_short_name?: string | null;
  /** Code Description */    rsrc_catg_name?: string | null;

  /** Parent Code */         parent_rsrc_catg_id?: number | null;
  /** Sort Order */          seq_num?: number | null;
}
