// src/app/xer/models/asgnmntcattype.model.ts
// ASGNMNTCATTYPE — Assignment Codes
// P6 EPPM Field → P6 EPPM Column Name

import { XERScalar } from '../parser';

export interface ASGNMNTCATTYPERow extends Record<string, XERScalar> {
  /** Unique Id */
  asgnmnt_catg_type_id: number;

  /** Assignment Code */
  asgnmnt_catg_type?: string | null;

  /** Max Code Length */
  asgnmnt_catg_short_len?: number | null;

  /** Sort Order */
  seq_num?: number | null;

  /** Secure Code */
  super_flag?: string | null; // обычно 'Y' / 'N'
}
