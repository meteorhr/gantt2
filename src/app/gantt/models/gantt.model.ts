// src/app/gantt/models/gantt.model.ts

import { BarColorName, ColumnKey, IsoDate } from "./gantt.types";

export interface BarColor { name: BarColorName; color: string; }
export interface ColumnDef {
  key: ColumnKey;         // ключ поля
  title: string;          // заголовок в шапке
  width: number;          // текущая ширина
  minWidth: number;       // минимальная ширина при ресайзе
  align?: 'left' | 'center' | 'right';
}

export interface RefLine {
  name: string;
  date: Date | string;   // можно '2025-12-01' или new Date(...)
  color: string;         // 'red' | '#f00' | 'rgb(...)'
  dash?: number[];       // опционально: штрих [6,4] и т.п.
}



export  interface Node {
  id: string;
  task_code?: string | null;
  task_name?: string | null;

  task_type?: string | null;
  task_type_label?: string | null;
  task_type_i18n?: string | null;

  complete_pct_type?: string | null;
  complete_pct_type_label?: string | null;
  complete_pct_type_i18n?: string | null;

  duration_type?: string | null;
  duration_type_label?: string | null;
  duration_type_i18n?: string | null;

  status_code?: string | null;
  status_code_label?: string | null;
  status_code_i18n?: string | null;
  
  priority_type?: string | null;
  priority_type_label?: string | null;
  priority_type_i18n?: string | null;
  
  float_path?: string | null;
  float_path_order?: number | null;

  
  
  
  
  

  
  
      
      
     
  name: string;
  start: IsoDate;
  finish: IsoDate;
  baselineStart?: IsoDate;
  baselineFinish?: IsoDate;
  /**
   * Full date set from XER.
   * Note: "target" dates are mapped to baselineStart/baselineFinish.
   * "actual" dates are represented by start/finish below (no extra fields).
   */
  earlyStart?: IsoDate | null;
  earlyFinish?: IsoDate | null;
  lateStart?: IsoDate | null;
  lateFinish?: IsoDate | null;
  /** Some XERs provide only expected end; keep as optional. */
  expectEnd?: IsoDate | null;
  complete?: number;
  dependency?: string[];
  children?: Node[];
  critical?: boolean;
  resources?: ResourceAssignment[];
  rsrc_names?: string | null;
}

export interface FlatRow {
  id: string;
  parentId: string | null;
  path: string[];
  wbs: string;
  name: string;
  start: string;
  finish: string;
  level: number;
  complete?: number;
  hasChildren: boolean;
  baselineStart?: string;
  baselineFinish?: string;
}

export interface GanttTooltipData {
  wbs?: string | null;
  name: string;
  start?: string | null;
  finish?: string | null;
  baselineStart?: string | null;
  baselineFinish?: string | null;
  durationDays?: number | null;
  complete?: number | null;
}
export interface ResourceAssignment {
  taskrsrc_id: number;
  rsrc_id: number | null;

  rsrc_name?: string | null;
  rsrc_short_name?: string | null;
  rsrc_type?: string | null;     // RT_Labor / RT_Material / RT_Nonlabor

  role_id?: number | null;
  role_short_name?: string | null;
  role_name?: string | null;

  unit_id?: number | null;
  curr_id?: number | null;

  // нагрузки / трудозатраты
  target_qty?: number | null;    // Бюджетные ед.
  remain_qty?: number | null;    // Оставшиеся ед.
  act_reg_qty?: number | null;   // Факт (обычные часы)
  act_ot_qty?: number | null;    // Факт (сверхурочные)

  // стоимость
  cost_per_qty?: number | null;
  rate_type?: string | null;     // COST_PER_QTY / etc.

  target_cost?: number | null;
  remain_cost?: number | null;
  act_reg_cost?: number | null;
  act_ot_cost?: number | null;
}

