// src/app/xer/models/schedoptions.model.ts
import { XERRowBase } from './base.model';

/** SCHEDOPTIONS — Schedule Options */
export interface SCHEDOPTIONSRow extends XERRowBase {

  /** Unique ID */                                  schedoptions_id: number;
  /** Project */                                    proj_id?: number | null;

  enable_multiple_longest_path_calc?: string | number | null;
  key_activity_for_multiple_longest_paths?: string | number | null;
  level_all_rsrc_flag?: string | number | null;
  level_float_thrs_cnt?: number | null;
  level_keep_sched_date_flag?: string | number | null;
  level_outer_assign_flag?: string | number | null;
  level_outer_assign_priority?: number | null;
  level_over_alloc_pct?: number | null;
  level_within_float_flag?: string | number | null;
  /** opaque list field */                          LevelPriorityList?: string | null;
  limit_multiple_longest_path_calc?: string | number | null;
  max_multiple_longest_path?: number | null;
  sched_calendar_on_relationship_lag?: string | number | null;
  sched_float_type?: string | null;
  sched_lag_early_start_flag?: string | number | null;
  sched_open_critical_flag?: string | number | null;
  sched_outer_depend_type?: string | null;
  sched_progress_override?: string | number | null;
  sched_retained_logic?: string | number | null;
  sched_setplantoforecast?: string | number | null;
  sched_use_expect_end_flag?: string | number | null;
  sched_use_project_end_date_for_float?: string | number | null;
  use_total_float_multiple_longest_paths?: string | number | null;
}
