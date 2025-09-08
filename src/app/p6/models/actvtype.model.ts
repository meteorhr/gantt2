// src/app/xer/models/actvtype.model.ts
import { XERRowBase } from './base.model';

/**
 * ACTVTYPE — Activity Codes (типы кодов активностей)
 * P6 EPPM Column Name ↔ комментарий с P6 EPPM Field.
 */
export interface ACTVTYPERow extends XERRowBase {

  /** Unique ID */                 actv_code_type_id: number;
  /** Activity Code */             actv_code_type?: string | null;
  /** Activity Code Type Scope */  actv_code_type_scope?: string | null;
  /** Max Code Length */           actv_short_len?: number | null;
  /** EPS/Project */               proj_id?: number | null;
  /** Sort Order */                seq_num?: number | null;
  /** Secure Code */               super_flag?: string | number | null; // обычно 'Y'/'N'
}
