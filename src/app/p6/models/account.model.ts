import { XERRowBase } from './base.model';

/**
 * ACCOUNT — Cost Accounts (счета затрат)
 * Поля соответствуют XER "P6 EPPM Column Name".
 * Комментарии — "P6 EPPM Field".
 */
export interface ACCOUNTRow extends XERRowBase {

  /** Unique ID */                          acct_id: number;

  /** Cost Account Name */                  acct_name?: string | null;
  /** Cost Account ID */                    acct_short_name?: string | null;
  /** Cost Account Description */           acct_descr?: string | null;

  /** Sort Order */                         acct_seq_num?: number | null;

  /** Parent Cost Account */                parent_acct_id?: number | null;
}