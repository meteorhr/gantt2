// src/app/xer/models/rcattype.model.ts
import { XERRowBase } from './base.model';

/** RCATTYPE — Resource Codes */
export interface RCATTYPERow extends XERRowBase {

  /** Unique ID */           rsrc_catg_type_id: number;
  /** Resource Code */       rsrc_catg_type?: string | null;
  /** Max Code Length */     rsrc_catg_short_len?: number | null;
  /** Sort Order */          seq_num?: number | null;
  /** Secure Code */         super_flag?: string | number | null;
}