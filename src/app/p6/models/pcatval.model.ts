// src/app/xer/models/pcatval.model.ts
import { XERRowBase } from './base.model';

/** PCATVAL — Project Code Values */
export interface PCATVALRow extends XERRowBase {

  /** Unique ID */                 proj_catg_id: number;
  /** Project Code */              proj_catg_type_id?: number | null;
  /** Project Code Value */        proj_catg_short_name?: string | null;
  /** Code Description */          proj_catg_name?: string | null;
  /** Parent Code */               parent_proj_catg_id?: number | null;
  /** Weight (P6 Pro only) */      proj_catg_wt?: number | null;
  /** Sort Order */                seq_num?: number | null;
}
