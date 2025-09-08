// src/app/xer/models/currtype.model.ts
import { XERRowBase } from './base.model';

/** CURRTYPE — Currency Types */
export interface CURRTYPERow extends XERRowBase {

  /** Unique ID */                     curr_id: number;
  /** Currency Name */                 curr_type?: string | null;
  /** Currency ID */                   curr_short_name?: string | null;
  /** Currency Symbol */               curr_symbol?: string | null;

  /** Exchange Rate */                 base_exch_rate?: number | null;

  /** Number of Digits after Decimal */ decimal_digit_cnt?: number | null;
  /** Decimal Symbol */                decimal_symbol?: string | null;
  /** Digit Grouping Symbol */         digit_group_symbol?: string | null;
  /** Currency Group Digit Count */    group_digit_cnt?: number | null;

  /** Negative Currency Format */      neg_curr_fmt_type?: string | number | null;
  /** Positive Currency Format */      pos_curr_fmt_type?: string | number | null;
}
