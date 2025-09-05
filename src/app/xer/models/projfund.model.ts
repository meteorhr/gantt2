// src/app/xer/models/projfund.model.ts
import { XERRowBase } from './base.model';

/** PROJFUND — Project Funding Assignments */
export interface PROJFUNDRow extends XERRowBase {

  /** Unique ID */         proj_fund_id: number;
  /** Project */           proj_id?: number | null;
  /** Funding Source */    fund_id?: number | null;

  /** Amount */            fund_cost?: number | null;
  /** Fund Share */        fund_wt?: number | null;
}