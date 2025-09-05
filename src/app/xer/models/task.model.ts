// src/app/xer/models/task.model.ts
// Совместимо с Record<string, XERScalar> из xer-parser.
// Все поля без "?" (никаких undefined), пустые значения — null.

import { XERRowBase, P6YesNo } from './base.model';

export interface TaskRow extends XERRowBase {
  // Идентификаторы/общие
  task_id: number;
  proj_id: number;
  wbs_id: number | null;
  task_code: string | null;
  task_name: string | null;
  task_type: string | null;
  complete_pct_type: string | null;
  duration_type: string | null;
  status_code: string | null;
  clndr_id: number | null;
  rsrc_id: number | null;
  priority_type: string | null;
  driving_path_flag: P6YesNo;
  float_path: string | null;
  float_path_order: number | null;

  // Даты план/ран/поздн/факт/ожидаемые/остаточные
  act_start_date: Date | string | null;
  act_end_date: Date | string | null;
  early_start_date: Date | string | null;
  early_end_date: Date | string | null;
  late_start_date: Date | string | null;
  late_end_date: Date | string | null;
  expect_end_date: Date | string | null;
  restart_date: Date | string | null;
  reend_date: Date | string | null;
  rem_late_start_date: Date | string | null;
  rem_late_end_date: Date | string | null;
  target_start_date: Date | string | null;
  target_end_date: Date | string | null;
  suspend_date: Date | string | null;
  resume_date: Date | string | null;
  cstr_type: string | null;
  cstr_date: Date | string | null;
  cstr_type2: string | null;
  cstr_date2: Date | string | null;
  external_early_start_date: Date | string | null;
  external_late_end_date: Date | string | null;

  // Единицы/продолжительности/флоаты/процент
  act_work_qty: number | null;
  act_equip_qty: number | null;
  act_this_per_work_qty: number | null;
  act_this_per_equip_qty: number | null;
  target_work_qty: number | null;
  target_equip_qty: number | null;
  remain_work_qty: number | null;
  remain_equip_qty: number | null;
  remain_drtn_hr_cnt: number | null;
  target_drtn_hr_cnt: number | null;
  free_float_hr_cnt: number | null;
  total_float_hr_cnt: number | null;
  phys_complete_pct: number | null;

  // Флаги
  auto_compute_act_flag: P6YesNo;
  lock_plan_flag: P6YesNo;
  rev_fdbk_flag: P6YesNo;

  // Прочее/аудит
  location_id: number | null;
  est_wt: number | null;
  review_end_date: Date | string | null;
  review_type: string | null;
  guid: string | null;
  tmpl_guid: string | null;
  create_user: string | null;
  create_date: Date | string | null;
  update_user: string | null;
  update_date: Date | string | null;
}