// src/app/xer/models/thrsparm.model.ts
import { XERRowBase } from './base.model';
/** THRSPARM — Threshold Parameters */
export interface THRSPARMRow extends XERRowBase {

  /** Unique ID */            thresh_parm_id: number;
  /** Threshold Parameter */  thresh_parm_name?: string | null;
  /** Threshold Name */       thresh_short_name?: string | null;
  /** Threshold Parameter Type */ thresh_parm_type?: string | null;
  /** Threshold Field Name */ thresh_field_name?: string | null;

  /** Sort Order */           seq_num?: number | null;
  /** Priority */             priority_type?: string | null;

  /** Applies to Activities */task_flag?: string | number | null;
  /** Applies to Resources */ rsrc_flag?: string | number | null;
  /** Applies to WBS */       wbs_flag?: string | number | null;
}
