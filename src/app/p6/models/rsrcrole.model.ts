
import { XERRowBase } from './base.model';
/** RSRCROLE — Resource Role Assignments */
export interface RSRCROLERow extends XERRowBase {

  /** Role (Unique ID) */     rsrc_role_id: number;

  /** Resource */             rsrc_id?: number | null;
  /** Resource Name */        rsrc_name?: string | null;
  /** Resource ID */          rsrc_short_name?: string | null;
  /** Resource Type */        rsrc_type?: string | null;

  /** Role */                 role_id?: number | null;
  /** Role Name */            role_name?: string | null;
  /** Role ID */              role_short_name?: string | null;

  /** Proficiency */          skill_level?: number | null;
}