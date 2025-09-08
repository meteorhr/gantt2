// src/app/xer/models/umeasure.model.ts
import { XERRowBase } from './base.model';

/** UMEASURE — Units of Measure */
export interface UMEASURERow extends XERRowBase {

  /** Unique ID */         unit_id: number;
  /** Unit Name */         unit_name?: string | null;
  /** Unit Abbreviation */ unit_abbrev?: string | null;
  /** Sort Order */        seq_num?: number | null;
}
