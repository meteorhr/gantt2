// src/app/xer/models/project.model.ts
import { XERRowBase } from './base.model';

export interface PROJECTRow extends XERRowBase {
  /** Unique ID */                                  proj_id: number;

  /** Project ID */                                 proj_short_name?: string | null;
  /** Project Web Site URL */                       proj_url?: string | null;
  /** Global Unique ID */                           guid?: string | null;

  /** Planned Start */                              plan_start_date?: Date | string | null;
  /** Must Finish By */                             plan_end_date?: Date | string | null;
  /** Schedule Finish */                            scd_end_date?: Date | string | null;
  /** Project Forecast Start */                     fcst_start_date?: Date | string | null;

  /** Date Added */                                 add_date?: Date | string | null;
  /** Added By */                                   add_by_name?: string | null;

  /** Last Apply Actuals Date */                    apply_actuals_date?: Date | string | null;
  /** Last Update Date (baseline) */                last_baseline_update_date?: Date | string | null;
  /** Last Leveled Date */                          last_level_date?: Date | string | null;
  /** Last Recalc Date */                           last_recalc_date?: Date | string | null;
  /** Last Scheduled Date */                        last_schedule_date?: Date | string | null;
  /** Last Summarized Date */                       last_tasksum_date?: Date | string | null;
  /** Summarized Data Date */                       sum_data_date?: Date | string | null;
  /** Last Checksum */                              last_checksum?: string | number | null;

  /** Default Calendar */                           clndr_id?: number | null;
  /** Baseline Type */                              base_type_id?: number | null;
  /** Project Baseline */                           sum_base_proj_id?: number | null;
  /** Financial Period */                           last_fin_dates_id?: number | null;
  /** Financial Period Calendar ID */               fintmpl_id?: number | null;
  /** Fiscal Year Begins */                         fy_start_month_num?: number | null;

  /** Critical activities have float <= */          critical_drtn_hr_cnt?: number | null;
  /** Critical path type */                         critical_path_type?: string | number | null;

  /** Default Percent Complete Type */              def_complete_pct_type?: string | number | null;
  /** Default Duration Type */                      def_duration_type?: string | number | null;
  /** Default Activity Type */                      def_task_type?: string | number | null;
  /** Default Price / Unit */                       def_cost_per_qty?: number | null;
  /** Rate Type */                                  def_rate_type?: string | number | null;
  /** Default Price Time Units */                   def_qty_type?: string | number | null;
  /** Drive Activity Dates Default */               def_rollup_dates_flag?: string | number | null;

  /** Activity ID Prefix */                         task_code_prefix?: string | null;
  /** Activity ID Suffix */                         task_code_base?: string | null;
  /** Activity ID Increment */                      task_code_step?: number | null;
  /** Activity ID based on selected activity */     task_code_prefix_flag?: string | number | null;
  /** Code Separator */                             name_sep_char?: string | null;

  /** Project Leveling Priority */                  priority_num?: number | null;
  /** Strategic Priority */                         strgy_priority_num?: number | null;

  /** Default Cost Account */                       acct_id?: number | null;
  /** Project Location */                           location_id?: number | null;
  /** Source Project */                             source_proj_id?: number | null;
  /** Original Project */                           orig_proj_id?: number | null;

  /** Enable Summarization */                       batch_sum_flag?: string | number | null;
  /** Contains Summarized Data Only */              sum_only_flag?: string | number | null;
  /** Summarized Assignments Level */               sum_assign_level?: number | null;
  /** WBS Max Summarization Level */                wbs_max_sum_level?: number | null;

  /** Publication Priority */                       px_priority?: number | null;
  /** Enable Publication */                         px_enable_publication_flag?: string | number | null;
  /** Last Publish Run (Pro only) */                px_last_update_date?: Date | string | null;

  /** Link Percent Complete With Actual */          act_pct_link_flag?: string | number | null;
  /** Link actual to date & this period */          act_this_per_link_flag?: string | number | null;
  /** Add Actual To Remain */                       add_act_remain_flag?: string | number | null;

  /** Can resources mark activities completed */    allow_complete_flag?: string | number | null;
  /** Allow Negative Actual Units */                allow_neg_act_flag?: string | number | null;
  /** Can assign resource multiple times */         rsrc_multi_assign_flag?: string | number | null;
  /** Can resources self-assign */                  rsrc_self_add_flag?: string | number | null;

  /** Status Update Control */                      control_updates_flag?: string | number | null;

  /** Content Repo External UUID */                 cr_external_key?: string | null;

  /** Project Check-out Status */                   checkout_flag?: string | number | null;
  /** Date Checked Out */                           checkout_date?: Date | string | null;
  /** Checked Out By */                             checkout_user_id?: number | null;

  /** Risk Level (Pro only) */                      risk_level?: string | number | null;
  /** History Level */                              hist_level?: string | number | null;
  /** History Interval */                           hist_interval?: string | number | null;

  /** Integrated Project (Pro only) */              intg_proj_type?: string | number | null;
  /** Project Flag */                               project_flag?: string | number | null;
  /** Use project baseline flag */                  use_project_baseline_flag?: string | number | null;

  /** Web Site Root Directory */                    web_local_root_path?: string | null;

  /** Link Budget and At Completion */              rem_target_link_flag?: string | number | null;
  /** Reset Original to Remaining */                reset_planned_flag?: string | number | null;
}
