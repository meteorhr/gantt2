// src/app/xer/models/shift.model.ts
// SHIFT — Shift Names
// P6 EPPM Field → P6 EPPM Column Name

import { XERScalar } from '../xer-parser';

export interface SHIFTRow extends Record<string, XERScalar> {
  /** Unique ID */
  shift_id: number;

  /** Shift Name */
  shift_name?: string | null;
}