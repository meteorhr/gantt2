import { DcmaCheck1Advanced } from './types/adv1-settings.types';

/** Идентификаторы чеков DCMA 1..14 */
export type DcmaCheckId =
  1|2|3|4|5|6|7|8|9|10|11|12|13|14;

export const DCMA_IDS: readonly DcmaCheckId[] =
  [1,2,3,4,5,6,7,8,9,10,11,12,13,14] as const;

export const DCMA_CHECK_LABELS: Record<DcmaCheckId, string> = {
  1:'Logic', 2:'Leads', 3:'Lags', 4:'Relationship Types', 5:'Hard Constraints',
  6:'High Float', 7:'Negative Float', 8:'High Duration', 9:'Invalid Dates',
  10:'Resources', 11:'Missed Tasks', 12:'Critical Path Test', 13:'CPLI', 14:'BEI',
};

/** Общие настройки для каждого чека */
export interface DcmaCheckCommonSettings {
  enabled: boolean;
  showInTable: boolean;
}


export type DcmaCheck1AdvancedPatch =
  Partial<Omit<DcmaCheck1Advanced, 'thresholds'>> & {
    thresholds?: Partial<DcmaCheck1Advanced['thresholds']>;
  };
  
export interface PersistedSettingsV1 {
  version: 1;
  common: Record<DcmaCheckId, DcmaCheckCommonSettings>;
  adv1: DcmaCheck1Advanced;
}

export const SETTINGS_STORAGE_KEY = 'p6.dcma.settings.v1';

/** ДЕФОЛТЫ (вынесены в отдельный файл, как просили) */
export const DEFAULT_PERSISTED_V1: PersistedSettingsV1 = {
  version: 1,
  common: {
    1:{enabled:true, showInTable:true},
    2:{enabled:true, showInTable:true},
    3:{enabled:true, showInTable:true},
    4:{enabled:true, showInTable:true},
    5:{enabled:true, showInTable:true},
    6:{enabled:true, showInTable:true},
    7:{enabled:true, showInTable:true},
    8:{enabled:true, showInTable:true},
    9:{enabled:true, showInTable:true},
    10:{enabled:true, showInTable:true},
    11:{enabled:true, showInTable:true},
    12:{enabled:true, showInTable:true},
    13:{enabled:true, showInTable:true},
    14:{enabled:true, showInTable:true},
  },
  adv1: {
    showOnMain: true,
    includeTaskResDep: true,
    includeMilestones: true,   // учитываем как «исключения» в анализе логики
    includeLoE: false,         // LoE обычно исключают из логики
    includeWbsSummary: false,  // «Hammock/WBS summary» — исключаем
    includeCompleted: false,   // завершенные не учитываем для Logic
    includeObsolete: false,
    thresholds: {
      greatPct: 1,  // <=1% Missing Any — отлично
      averagePct: 5 // <=5% — средне, >5% — плохо
    }
  }
};

/** Простая валидация (на случай поврежденного localStorage) */
export function normalizePersisted(input: any): PersistedSettingsV1 {
  const d = DEFAULT_PERSISTED_V1;
  try {
    if (!input || input.version !== 1) return structuredClone(d);
    const out: PersistedSettingsV1 = structuredClone(d);

    for (const id of DCMA_IDS) {
      const c = input.common?.[id];
      out.common[id] = {
        enabled: typeof c?.enabled === 'boolean' ? c.enabled : d.common[id].enabled,
        showInTable: typeof c?.showInTable === 'boolean' ? c.showInTable : d.common[id].showInTable,
      };
    }

    const a = input.adv1 ?? {};
    out.adv1 = {
      showOnMain: !!a.showOnMain,
      includeTaskResDep: !!a.includeTaskResDep,
      includeMilestones: !!a.includeMilestones,
      includeLoE: !!a.includeLoE,
      includeWbsSummary: !!a.includeWbsSummary,
      includeCompleted: !!a.includeCompleted,
      includeObsolete: !!a.includeObsolete,
      thresholds: {
        greatPct: clampPct(a.thresholds?.greatPct ?? d.adv1.thresholds.greatPct),
        averagePct: clampPct(a.thresholds?.averagePct ?? d.adv1.thresholds.averagePct),
      }
    };

    return out;
  } catch {
    return structuredClone(d);
  }
}

function clampPct(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}


/** --------------------- ЦВЕТОВЫЕ ЗОНЫ / ГРЕЙДЫ ---------------------- */

export type Grade = 'great' | 'average' | 'poor';

/** Палитра совпадает с threshold-bar: зелёный / жёлтый / красный */
export const ZONE_COLORS = {
  great:   '#4CAF50',
  average: '#FFC107',
  poor:    '#EF5350',
} as const;

/** Универсальная оценка зоны: когда "меньше — лучше" (проценты ошибок и т.п.) */
export function evaluateGradeLowerIsBetter(
  value: number | null | undefined,
  greatPct: number,
  averagePct: number
): Grade {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'poor';
  const v = Number(value);
  const g = clampPct(greatPct);
  const a = clampPct(averagePct);
  if (v <= g) return 'great';
  if (v <= a) return 'average';
  return 'poor';
}

/** Универсальная оценка зоны: когда "больше — лучше" (индексы BEI/CPLI и т.п.) */
export function evaluateGradeHigherIsBetter(
  value: number | null | undefined,
  greatPct: number,
  averagePct: number
): Grade {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'poor';
  const v = Number(value);
  const g = clampPct(greatPct);
  const a = clampPct(averagePct);
  if (v >= g) return 'great';
  if (v >= a) return 'average';
  return 'poor';
}

/** Универсальный фасад: вернёт grade и цвет, с направлением метрики. */
export function getZoneByPercent(
  value: number | null | undefined,
  greatPct: number,
  averagePct: number,
  lowerIsBetter: boolean = true
): { grade: Grade; color: string } {
  const grade = lowerIsBetter
    ? evaluateGradeLowerIsBetter(value, greatPct, averagePct)
    : evaluateGradeHigherIsBetter(value, greatPct, averagePct);
  return { grade, color: ZONE_COLORS[grade] };
}

/** Удобный фасад для Check 1: берёт пороги из adv1.thresholds (меньше — лучше) */
export function getCheck1Zone(
  value: number | null | undefined,
  persisted: PersistedSettingsV1
): { grade: Grade; color: string } {
  const g = persisted.adv1.thresholds.greatPct;
  const a = persisted.adv1.thresholds.averagePct;
  return getZoneByPercent(value, g, a, true);
}
