// src/app/xer/models/rsrcrcat.model.ts
import { XERRowBase } from './base.model';

/** RSRCRCAT — Resource Code Assignments */
export interface RSRCRCATRow extends XERRowBase {

  /** Code Value */           rsrc_catg_id?: number | null;
  /** Resource Code */        rsrc_catg_type_id?: number | null;
  /** Resource */             rsrc_id?: number | null;
}
