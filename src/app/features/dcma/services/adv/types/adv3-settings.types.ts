// src/app/dcma/services/adv/adv3-settings.types.ts

export type DcmaCheck3Advanced = {
  /** Детализация */
  includeDetails: boolean;
  detailsLimit: number;

  /** HPD: источник и фолбэк */
  hoursPerDay: number;
  calendarSource: 'successor' | 'predecessor' | 'fixed';
  fixedHoursPerDay: number;

  /** Типы связей */
  includeLinkTypes: { FS: boolean; SS: boolean; FF: boolean; SF: boolean };

  /** Фильтры по типам активностей у связей */
  ignoreMilestoneRelations: boolean;
  ignoreLoERelations: boolean;
  ignoreWbsSummaryRelations: boolean;
  ignoreCompletedRelations: boolean;

  /** KPI-пороги (меньше = лучше) — влияют только на Grade */
  thresholds: { greatPct: number; averagePct: number };

  /** Толерансы; при strictFivePct=true действует DCMA-порог 5% */
  tolerance: { strictFivePct: boolean; percent: number; count: number; totalLagHours: number };
};