// src/app/xer/models/task.model.ts
// XER Import/Export Data Map Guide (Project) — таблица TASK (Activity).
// Комментарии: "P6 EPPM Field  →  P6 EPPM Column Name (XER)".
// Все поля сведены к XERScalar-типа: string | number | Date | null (флаги 'Y'|'N' — это string).
// Важно: индекс-сигнатура делает интерфейс совместимым с Record<string, XERScalar>.

import { XERScalar } from '../xer-parser';

export type P6YesNo = 'Y' | 'N' | null;

// База для всех строк XER: позволяет обращаться по произвольному полю.
export interface XERRowBase {
  [key: string]: XERScalar;
}

export interface TaskRow extends XERRowBase {
  /** Unique ID → task_id */
  task_id: number;

  /** Project → proj_id */
  proj_id: number;

  /** WBS → wbs_id */
  wbs_id: number | null;

  /** Activity ID → task_code */
  task_code: string | null;

  /** Activity Name → task_name */
  task_name: string | null;

  /** Activity Type → task_type */
  task_type?: string | null;

  /** Percent Complete Type → complete_pct_type */
  complete_pct_type?: string | null;

  /** Duration Type → duration_type */
  duration_type?: string | null;

  /** Activity Status → status_code */
  status_code?: string | null;

  /** Calendar → clndr_id */
  clndr_id?: number | null;

  /** Primary Resource → rsrc_id */
  rsrc_id?: number | null;

  /** Activity Leveling Priority → priority_type */
  priority_type?: string | null;

  /** Longest Path → driving_path_flag */
  driving_path_flag?: P6YesNo;

  /** Float Path → float_path */
  float_path?: string | null;

  /** Float Path Order → float_path_order */
  float_path_order?: number | null;

  /** Free Float (hours) → free_float_hr_cnt */
  free_float_hr_cnt?: number | null;

  /** Total Float (hours) → total_float_hr_cnt */
  total_float_hr_cnt?: number | null;

  /** Planned Duration → target_drtn_hr_cnt */
  target_drtn_hr_cnt?: number | null;

  /** Actual Start → act_start_date */
  act_start_date?: Date | string | null;

  /** Actual Finish → act_end_date */
  act_end_date?: Date | string | null;

  /** Early Start/Finish → early_* */
  early_start_date?: Date | string | null;
  early_end_date?: Date | string | null;

  /** Late Start/Finish → late_* */
  late_start_date?: Date | string | null;
  late_end_date?: Date | string | null;

  /** Expected Finish → expect_end_date */
  expect_end_date?: Date | string | null;

  /** Remaining Early Start/Finish → re* */
  restart_date?: Date | string | null;
  reend_date?: Date | string | null;

  /** Remaining Late Start/Finish → rem_late_* */
  rem_late_start_date?: Date | string | null;
  rem_late_end_date?: Date | string | null;

  /** Planned Start/Finish → target_*_date */
  target_start_date?: Date | string | null;
  target_end_date?: Date | string | null;

  /** Units */
  act_work_qty?: number | null;                // Actual Labor Units
  act_equip_qty?: number | null;               // Actual Nonlabor Units
  act_this_per_work_qty?: number | null;       // Actual This Period Labor Units
  act_this_per_equip_qty?: number | null;      // Actual This Period Nonlabor Units
  target_work_qty?: number | null;             // Planned/Budgeted Labor Units
  target_equip_qty?: number | null;            // Planned/Budgeted Nonlabor Units
  remain_work_qty?: number | null;             // Remaining Labor Units
  remain_equip_qty?: number | null;            // Remaining Nonlabor Units

  /** Remaining Duration (hours) */
  remain_drtn_hr_cnt?: number | null;

  /** Flags */
  auto_compute_act_flag?: P6YesNo;             // Auto Compute Actuals
  lock_plan_flag?: P6YesNo;                    // Lock Remaining
  rev_fdbk_flag?: P6YesNo;                     // New Feedback

  /** Suspend / Resume */
  suspend_date?: Date | string | null;
  resume_date?: Date | string | null;

  /** Constraints */
  cstr_type?: string | null;
  cstr_date?: Date | string | null;
  cstr_type2?: string | null;
  cstr_date2?: Date | string | null;

  /** External dates */
  external_early_start_date?: Date | string | null;
  external_late_end_date?: Date | string | null;

  /** Misc */
  location_id?: number | null;
  est_wt?: number | null;                      // P6 Pro only
  review_end_date?: Date | string | null;      // P6 Pro only
  review_type?: string | null;                 // P6 Pro only
  guid?: string | null;
  tmpl_guid?: string | null;
  create_user?: string | null;
  create_date?: Date | string | null;
  update_user?: string | null;
  update_date?: Date | string | null;
}
