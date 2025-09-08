// src/app/xer/models/roles.model.ts
import { XERRowBase } from './base.model';

/** ROLES — Roles */
export interface ROLESRow extends XERRowBase {

  /** Unique ID */                 role_id: number;

  /** Role ID */                   role_short_name?: string | null;
  /** Role Name */                 role_name?: string | null;
  /** Responsibilities */          role_descr?: string | null;

  /** Parent Role */               parent_role_id?: number | null;
  /** Sort Order */                seq_num?: number | null;

  /** Price Time Units */          cost_qty_type?: string | null;
  /** Calculate costs from units */def_cost_qty_link_flag?: string | number | null;
}