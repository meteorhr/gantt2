// src/app/xer/models/projpcat.model.ts
import { XERRowBase } from './base.model';

/** PROJPCAT — Project Code Assignments */
export interface PROJPCATRow extends XERRowBase {

  /** Project */        proj_id?: number | null;
  /** Project Code */   proj_catg_type_id?: number | null;
  /** Code Value */     proj_catg_id?: number | null;
}
