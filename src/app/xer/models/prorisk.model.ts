// src/app/xer/models/prorisk.model.ts
import { XERRowBase } from './base.model';

/** PRORISK — Risks (P6 Professional only) */
export interface PRORISKRow extends XERRowBase {

  /** Unique ID */                     risk_id: number;

  /** Project ID */                    proj_id?: number | null;
  /** Activity */                      task_id?: number | null; // в некоторых выгрузках присутствует
  /** Risk Name */                     risk_name?: string | null;
  /** Risk ID */                       risk_code?: string | null;
  /** Risk Description */              risk_desc?: string | null;
  /** Risk Cause */                    risk_cause?: string | null;
  /** Risk Effect */                   risk_effect?: string | null;
  /** Risk Type */                     risk_to_type?: string | null;
  /** Risk Category ID */              risk_type_id?: number | null;
  /** Risk Owner (Resource) */         rsrc_id?: number | null;
  /** Risk Status */                   status_code?: string | number | null;

  /** Identified On */                 add_date?: Date | string | null;
  /** Identified By */                 identified_by_id?: number | null;
  /** Notes */                         notes?: string | null;

  /** Pre-Response Probability */      pre_rsp_prblty?: number | null;
  /** Pre-Response Cost */             pre_rsp_cost_prblty?: number | null;
  /** Pre-Response Schedule */         pre_rsp_schd_prblty?: number | null;

  /** Post-Response Probability */     post_rsp_prblty?: number | null;
  /** Post-Response Cost */            post_rsp_cost_prblty?: number | null;
  /** Post-Response Schedule */        post_rsp_schd_prblty?: number | null;

  /** Response Type */                 response_type?: string | null;
  /** Response Description */          response_text?: string | null;
}
