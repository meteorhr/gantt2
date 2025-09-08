// src/app/xer/models/rsrccurv.model.ts
import { XERRowBase } from './base.model';

/** RSRCCURV — Resource Curves */
export interface RSRCCURVRow extends XERRowBase {

  /** Unique ID */         curv_id: number;

  /** Resource Curve Name */ curv_name?: string | null;
  /** Data */              curv_data?: string | null;
  /** Default */           default_flag?: string | number | null;
}