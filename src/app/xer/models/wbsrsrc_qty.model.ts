// src/app/xer/models/wbsrsrc_qty.model.ts
import { XERRowBase } from './base.model';

/** WBSRSRC_QTY — агрегированные значения по периодам (формат в XER может отличаться) */
export interface WBSRSRC_QTYRow extends XERRowBase {

  /** fin_dates_id1 */   fin_dates_id1?: number | null;
  /** fin_dates_id2 */   fin_dates_id2?: number | null;
  /** fin_qty1 */        fin_qty1?: number | null;
  /** fin_qty2 */        fin_qty2?: number | null;

  /** month_start (дата начала месяца) */ month_start?: Date | string | null;
  /** week_start (дата начала недели) */  week_start?: Date | string | null;

  /** qty */             qty?: number | null;
}
