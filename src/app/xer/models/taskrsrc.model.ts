import { XERScalar } from '../xer-parser';
export interface XERRowBase { [k: string]: XERScalar; }

export interface TASKRSRCRow extends XERRowBase {
  taskrsrc_id: number;
  task_id: number;
  proj_id: number;

  // связки
  rsrc_id: number | null;
  role_id: number | null;

  // флаги/типы
  cost_qty_link_flag: string | null;  // 'Y'/'N'
  rsrc_type: string | null;           // RT_Labor/...
  rate_type: string | null;           // COST_PER_QTY / etc.
  cost_per_qty_source_type: string | null;

  // нагрузки
  remain_qty: number | null;
  target_qty: number | null;
  remain_qty_per_hr: number | null;
  target_qty_per_hr: number | null;
  act_reg_qty: number | null;
  act_ot_qty: number | null;

  // стоимость
  cost_per_qty: number | null;
  target_cost: number | null;
  remain_cost: number | null;
  act_reg_cost: number | null;
  act_ot_cost: number | null;

  // даты (как правила, target_* есть в XER)
  act_start_date: Date | string | null;
  act_end_date: Date | string | null;
  restart_date: Date | string | null;
  reend_date: Date | string | null;
  target_start_date: Date | string | null;
  target_end_date: Date | string | null;
  rem_late_start_date: Date | string | null;
  rem_late_end_date: Date | string | null;

  // прочее
  pobs_id: number | null;
  skill_level: number | null;
  relag_drtn_hr_cnt: number | null;
  guid: string | null;
  curv_id: number | null;
  unit_id: number | null;
  curr_id: number | null;
  create_user: string | null;
  create_date: Date | string | null;
  has_rsrchours: string | null;
  taskrsrc_sum_id: number | null;
}