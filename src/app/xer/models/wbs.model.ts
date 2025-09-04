// src/app/xer/models/wbs.model.ts
// PROJWBS (WBS) — XER Import/Export Data Map Guide (Project)
// Комментарии: "P6 EPPM Field  →  P6 EPPM Column Name (XER)".
// ВАЖНО: никаких undefined — только string | number | Date | null,
// чтобы удовлетворять индекс-сигнатуре XER: [key: string]: XERScalar.

import { XERScalar } from '../xer-parser';

export type P6YesNo = 'Y' | 'N' | null;

export interface XERRowBase {
  [key: string]: XERScalar; // string | number | Date | null
}

export interface WbsRow extends XERRowBase {
  /** Unique ID → wbs_id */
  wbs_id: number;

  /** Parent WBS → parent_wbs_id */
  parent_wbs_id: number | null;

  /** WBS Name → wbs_name */
  wbs_name: string | null;

  /** WBS Code → wbs_short_name */
  wbs_short_name: string | null;

  /** Project → proj_id */
  proj_id: number;

  /** Sort Order → seq_num */
  seq_num: number | null;

  /** Project Node → proj_node_flag */
  proj_node_flag: P6YesNo;

  /** Contains Summary Data → sum_data_flag */
  sum_data_flag: P6YesNo;

  /** Project Status → status_code */
  status_code: string | null;

  /** User Reviewing Status → status_reviewer */
  status_reviewer: string | null;

  /** WBS Category → phase_id */
  phase_id: number | null;

  /** Responsible Manager → obs_id */
  obs_id: number | null;

  /** Est Weight (P6 Professional only) → est_wt */
  est_wt: number | null;

  /** Global Unique ID → guid */
  guid: string | null;

  /** Methodology Global Unique ID → tmpl_guid */
  tmpl_guid: string | null;

  /** Anticipated Start → anticip_start_date */
  anticip_start_date: Date | string | null;

  /** Anticipated Finish → anticip_end_date */
  anticip_end_date: Date | string | null;

  /** Original Budget → orig_cost */
  orig_cost: number | null;

  /** Independent ETC Total Cost → indep_remain_total_cost */
  indep_remain_total_cost: number | null;

  /** Independent ETC Labor Units → indep_remain_work_qty */
  indep_remain_work_qty: number | null;

  /** Annual Discount Rate → ann_dscnt_rate_pct */
  ann_dscnt_rate_pct: number | null;

  /** Discount Application Period → dscnt_period_type */
  dscnt_period_type: string | null;

  /** Earned Value Percent Complete Technique → ev_compute_type */
  ev_compute_type: string | null;

  /** Earned Value Estimate-to-Complete Technique → ev_etc_compute_type */
  ev_etc_compute_type: string | null;

  /** Earned Value Performance Factor → ev_etc_user_value */
  ev_etc_user_value: number | null;

  /** Earned Value Percent Complete → ev_user_pct */
  ev_user_pct: number | null;
}