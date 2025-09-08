// src/app/xer/models/rsrclevellist.model.ts
import { XERRowBase } from './base.model';

/** RSRCLEVELLIST — Resource Level List */
export interface RSRCLEVELLISTRow extends XERRowBase {

  /** Unique ID */            rsrc_level_list_id: number;
  /** Resource */             rsrc_id?: number | null;
  /** SCHEDOPTIONS */         schedoptions_id?: number | null;
}
