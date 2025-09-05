// src/app/xer/models/asgnmntcatval.model.ts
// ASGNMNTCATVAL — Assignment Code Values
// P6 EPPM Field → P6 EPPM Column Name

import { XERScalar } from '../xer-parser';

export interface ASGNMNTCATVALRow extends Record<string, XERScalar> {
  /** Unique Id */
  asgnmnt_catg_id: number;

  /** Assignment Code */
  asgnmnt_catg_type_id?: number | null;

  /** Parent Code Value Id */
  parent_asgnmnt_catg_id?: number | null;

  /** Assignment Code Value */
  asgnmnt_catg_short_name?: string | null;

  /** Sort Order */
  seq_num?: number | null;

  /** Code Description */
  asgnmnt_catg_name?: string | null;
}
