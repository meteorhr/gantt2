// src/app/xer/models/phase.model.ts
import { XERRowBase } from './base.model';

/** PHASE — WBS Category / Current Phase */
export interface PHASERow extends XERRowBase {

  /** Unique ID */     phase_id: number;
  /** Category Value */phase_name?: string | null;
  /** Sort Order */    seq_num?: number | null;
}
