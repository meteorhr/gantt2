// src/app/xer/models/applyactoptions.model.ts
import { XERRowBase } from './base.model';
/**
 * APPLYACTOPTIONS — Apply Actual Options
 */
export interface APPLYACTOPTIONSRow extends XERRowBase {

  /** Project */                   proj_id: number;
  /** respect_duration_type */     respect_duration_type?: string | number | null;
}
