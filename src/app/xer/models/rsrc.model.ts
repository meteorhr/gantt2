import { XERScalar } from '../xer-parser';

export interface XERRowBase { [k: string]: XERScalar; }

export interface RSRCRow extends XERRowBase {
  rsrc_id: number;
  parent_rsrc_id: number | null;
  clndr_id: number | null;
  role_id: number | null;
  user_id: number | null;
  pobs_id: number | null;
  guid: string | null;
  rsrc_seq_num: number | null;
  email_addr: string | null;
  employee_code: string | null;
  office_phone: string | null;
  other_phone: string | null;
  rsrc_name: string | null;
  rsrc_short_name: string | null;
  rsrc_title_name: string | null;
  def_qty_per_hr: number | null;
  cost_qty_type: string | null;
  ot_factor: number | null;
  active_flag: string | null;
  auto_compute_act_flag: string | null;
  def_cost_qty_link_flag: string | null;
  ot_flag: string | null;
  curr_id: number | null;
  unit_id: number | null;
  rsrc_type: string | null; // RT_Labor / RT_Material / RT_Nonlabor
  location_id: number | null;
}