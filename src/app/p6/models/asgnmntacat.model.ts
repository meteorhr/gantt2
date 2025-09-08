// src/app/xer/models/asgnmntacat.model.ts
import { XERRowBase } from './base.model';

/**
 * ASGNMNTACAT — Assignment Code Assignments
 * Связка значения кода назначения с назначением ресурса/роли.
 */
export interface ASGNMNTACATRow extends XERRowBase {

  /** Assignment Code Value */     asgnmnt_catg_id: number;
  /** Assignment Code */           asgnmnt_catg_type_id?: number | null;
  /** Activity Resource/Role Assignment */ taskrsrc_id: number;
  /** Project */                   proj_id?: number | null;
}
