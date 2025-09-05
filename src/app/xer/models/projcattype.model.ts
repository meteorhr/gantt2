// src/app/xer/models/projcattype.model.ts
import { XERRowBase } from './base.model';

/** PROJCATTYPE — Project Codes (типы проектных кодов) */
export interface PROJCATTYPERow extends XERRowBase {

  /** Unique ID */                       proj_catg_type_id: number;
  /** Project Code */                    proj_catg_type?: string | null;
  /** Max Code Length */                 proj_catg_short_len?: number | null;
  /** Sort Order */                      seq_num?: number | null;

  /** Secure Code */                     super_flag?: string | number | null; // Y/N или 1/0
  /** Weight (P6 Pro only) */            proj_catg_type_wt?: number | null;
  /** Max Code Value Weight (Pro) */     max_proj_catg_wt?: number | null;
}