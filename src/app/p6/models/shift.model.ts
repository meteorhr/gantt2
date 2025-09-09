// src/app/xer/models/shift.model.ts
// SHIFT — Shift Names
// P6 EPPM Field → P6 EPPM Column Name

import { P6Scalar } from "../parser/parser.types";



export interface SHIFTRow extends Record<string, P6Scalar> {
  /** Unique ID */
  shift_id: number;

  /** Shift Name */
  shift_name?: string | null;
}