// src/app/xer/models/rsrccurvdata.model.ts
import { XERRowBase } from './base.model';

/** RSRCCURVDATA — Resource Curve Data */
export interface RSRCCURVDATARow extends XERRowBase {

  /** Unique ID */            curv_id: number;
  /** curv_name */            curv_name?: string | null;
  /** default_flag */         default_flag?: string | number | null;

  /** pct_usage_0..20 */      pct_usage_0?: number | null;
  pct_usage_1?: number | null;
  pct_usage_2?: number | null;
  pct_usage_3?: number | null;
  pct_usage_4?: number | null;
  pct_usage_5?: number | null;
  pct_usage_6?: number | null;
  pct_usage_7?: number | null;
  pct_usage_8?: number | null;
  pct_usage_9?: number | null;
  pct_usage_10?: number | null;
  pct_usage_11?: number | null;
  pct_usage_12?: number | null;
  pct_usage_13?: number | null;
  pct_usage_14?: number | null;
  pct_usage_15?: number | null;
  pct_usage_16?: number | null;
  pct_usage_17?: number | null;
  pct_usage_18?: number | null;
  pct_usage_19?: number | null;
  pct_usage_20?: number | null;
}
