// src/app/xer/models/rolercat.model.ts
import { XERRowBase } from './base.model';

/** ROLERCAT — Role Code Assignments */
export interface ROLERCATRow extends XERRowBase {

  /** Role ID */             role_id?: number | null;
  /** Role Code ID */        role_catg_type_id?: number | null;
  /** Code Value */          role_catg_id?: number | null;
}