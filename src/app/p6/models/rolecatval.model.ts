// src/app/xer/models/rolecatval.model.ts
import { XERRowBase } from './base.model';

/** ROLECATVAL — Role Code Values */
export interface ROLECATVALRow extends XERRowBase {

  /** Unique ID */           role_catg_id: number;
  /** Role Code ID */        role_catg_type_id?: number | null;

  /** Role Code Name */      role_catg_short_name?: string | null;
  /** Code Description */    role_catg_name?: string | null;

  /** Parent Code */         parent_role_catg_id?: number | null;
  /** Sort Order */          seq_num?: number | null;
}
