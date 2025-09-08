// src/app/xer/models/rolecattype.model.ts
import { XERRowBase } from './base.model';

/** ROLECATTYPE — Role Codes */
export interface ROLECATTYPERow extends XERRowBase {

  /** Unique ID */           role_catg_type_id: number;
  /** Role Code */           role_catg_type?: string | null;
  /** Max Code Length */     role_catg_short_len?: number | null;
  /** Sort Order */          seq_num?: number | null;
  /** Secure Code */         super_flag?: string | number | null;
}
