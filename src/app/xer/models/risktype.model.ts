// src/app/xer/models/risktype.model.ts
import { XERRowBase } from './base.model';

/** RISKTYPE — Risk Types (P6 Professional only) */
export interface RISKTYPERow extends XERRowBase {

  /** Unique ID */           risk_type_id: number;
  /** Risk Category */       risk_type?: string | null;
  /** Parent Risk Category */parent_risk_type_id?: number | null;
  /** Sort Order */          seq_num?: number | null;
}