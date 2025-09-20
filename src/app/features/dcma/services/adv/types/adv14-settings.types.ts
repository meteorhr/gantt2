// src/app/dcma/services/adv/adv14-settings.types.ts

/**
 * Advanced-настройки для DCMA Check 14 (BEI).
 * Специально без зависимостей от TaskRow/сервисов, чтобы избежать циклов импорта.
 */
export interface DcmaCheck14Advanced {
  /** Показывать подробные списки в результате анализа */
  includeDetails: boolean;

  /** Переопределение Data Date в ISO (если null — берём из PROJECT по порядку полей) */
  dataDateOverrideISO: string | null;

  /** Порядок приоритета полей PROJECT для извлечения Data Date */
  dataDateFieldOrder: string[];

  /** Порядок предпочтения полей Baseline Finish на уровне задач */
  baselineFinishFieldsOrder: string[];

  /** Сравнение BL Finish с DD: 'lte' — <= (по умолчанию), 'lt' — строго < */
  plannedComparisonMode: 'lte' | 'lt';

  /** Требовать наличие Actual Finish для зачёта фактического завершения (иначе фолбэк по статусу Completed) */
  requireActualFinishForActuals: boolean;

  /** Фильтры eligible-набора */
  ignoreWbsSummaryActivities: boolean;  // по умолчанию true
  ignoreMilestoneActivities: boolean;   // по умолчанию false
  ignoreLoEActivities: boolean;         // по умолчанию false
  ignoreCompletedActivities: boolean;   // по умолчанию false

  /** Пороги: Pass и KPI-уровни для визуальной оценки */
  thresholds: {
    /** Порог Pass: BEI >= requiredMinBei */
    requiredMinBei: number;  // default 0.95
    /** KPI Average: BEI >= averageMinBei */
    averageMinBei: number;   // default 0.95
    /** KPI Great: BEI >= greatMinBei */
    greatMinBei: number;     // default 1.0
  };
}