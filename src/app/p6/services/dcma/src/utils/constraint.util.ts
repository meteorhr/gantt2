// src/app/p6/services/dcma/utils/constraint.util.ts
export type ConstraintNorm =
  | 'HARD_MS' | 'HARD_MF'
  | 'SOFT_ALAP' | 'SOFT_ASAP'
  | 'SOFT_START_ON' | 'SOFT_START_ON_OR_BEFORE' | 'SOFT_START_ON_OR_AFTER'
  | 'SOFT_FINISH_ON' | 'SOFT_FINISH_ON_OR_BEFORE' | 'SOFT_FINISH_ON_OR_AFTER'
  | 'UNKNOWN';

export function normalizeConstraintType(v: unknown): ConstraintNorm {
  const s0 = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
  if (!s0) return 'UNKNOWN';
  // HARD (жёсткие)
  if (s0 === 'MANDATORY START' || s0 === 'MS' || s0 === 'HARD MS' || s0 === 'MANDATORY_START') return 'HARD_MS';
  if (s0 === 'MANDATORY FINISH' || s0 === 'MF' || s0 === 'HARD MF' || s0 === 'MANDATORY_FINISH') return 'HARD_MF';
  // SOFT (мягкие)
  if (s0 === 'ALAP' || s0 === 'AS LATE AS POSSIBLE') return 'SOFT_ALAP';
  if (s0 === 'ASAP' || s0 === 'AS SOON AS POSSIBLE') return 'SOFT_ASAP';
  if (s0 === 'START ON' || s0 === 'SO' || s0 === 'START_ON') return 'SOFT_START_ON';
  if (s0 === 'START ON OR BEFORE' || s0 === 'SOB' || s0 === 'START_ON_OR_BEFORE') return 'SOFT_START_ON_OR_BEFORE';
  if (s0 === 'START ON OR AFTER' || s0 === 'SOA' || s0 === 'START_ON_OR_AFTER') return 'SOFT_START_ON_OR_AFTER';
  if (s0 === 'FINISH ON' || s0 === 'FO' || s0 === 'FINISH_ON') return 'SOFT_FINISH_ON';
  if (s0 === 'FINISH ON OR BEFORE' || s0 === 'FOB' || s0 === 'FINISH_ON_OR_BEFORE') return 'SOFT_FINISH_ON_OR_BEFORE';
  if (s0 === 'FINISH ON OR AFTER' || s0 === 'FOA' || s0 === 'FINISH_ON_OR_AFTER') return 'SOFT_FINISH_ON_OR_AFTER';
  return 'UNKNOWN';
}

export function isHardConstraint(norm: ConstraintNorm): boolean {
  return norm === 'HARD_MS' || norm === 'HARD_MF';
}
