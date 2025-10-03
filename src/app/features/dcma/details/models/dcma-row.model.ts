import { Grade } from '../../services/adv/dcma-checks.config';
import { DcmaCheckId } from '../../services/adv/dcma-settings.service';

export interface DcmaRow {
  check: DcmaCheckId;
  metric: string;
  description: string;
  percent?: number | null;
  passed: boolean;
  result: any;
  grade?: Grade;
  color?: string;
}
