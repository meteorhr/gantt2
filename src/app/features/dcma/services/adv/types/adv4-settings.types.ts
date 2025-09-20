// src/app/dcma/services/adv/adv4-settings.types.ts

export type DcmaCheck4Advanced = {
  /** Детализация */
  includeDetails: boolean;
  detailsLimit: number;

  /** Фильтры по типам активностей у связей */
  ignoreMilestoneRelations: boolean;
  ignoreLoERelations: boolean;
  ignoreWbsSummaryRelations: boolean;
  ignoreCompletedRelations: boolean;

  /** Дедупликация связей в расчёте */
  dedupMode: 'byType' | 'byTypeAndLag';

  /** Пороговые значения: Pass по requiredPct; Grade по average/great */
  thresholds: { requiredPct: number; averagePct: number; greatPct: number };
};