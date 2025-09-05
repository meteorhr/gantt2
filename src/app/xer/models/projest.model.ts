// src/app/xer/models/projest.model.ts
import { XERRowBase } from './base.model';

/** PROJEST — Estimate History (P6 Professional only) */
export interface PROJESTRow extends XERRowBase {

  /** Unique ID */                       proj_est_id: number;
  /** Project */                         proj_id?: number | null;
  /** WBS */                             wbs_id?: number | null;
  /** Resource */                        rsrc_id?: number | null;
  /** Resource Type */                   rsrc_type?: string | null;

  /** Date */                            est_date?: Date | string | null;
  /** Estimate Name */                   est_name?: string | null;
  /** Assumptions & Notes */             est_notes?: string | null;
  /** Estimated Units */                 est_qty?: number | null;
  /** Total Activities */                est_task_cnt?: number | null;
  /** Method */                          est_type?: string | null;

  /** Adjustment Factor */               adj_mult_pct?: number | null;

  /** Size/Complexity */                 bu_cmplx_value?: number | null;
  /** Total Degree of Influence */       fp_cmplx_value?: number | null;
  /** FP/Person-Month */                 fp_prod_avg_value?: number | null;
  /** Unadjusted FP Count */             fp_unadj_cnt?: number | null;
  /** Final Adjusted FP Count */         fp_cnt?: number | null;

  /** Applied */                         applied_flag?: string | number | null;
}
