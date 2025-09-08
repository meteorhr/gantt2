// src/app/xer/models/obs.model.ts
import { XERRowBase } from './base.model';
/** OBS — Organizational Breakdown Structure */
export interface OBSRow extends XERRowBase {
  /** Unique ID */             obs_id: number;
  /** OBS Name */              obs_name?: string | null;
  /** OBS Description */       obs_descr?: string | null;
  /** Parent OBS */            parent_obs_id?: number | null;

  /** Global Unique ID */      guid?: string | null;
  /** Sort Order */            seq_num?: number | null;
}
