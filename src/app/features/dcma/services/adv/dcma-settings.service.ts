import { Injectable } from '@angular/core';
import {
  DcmaCheckId, DCMA_IDS, DcmaCheck1AdvancedPatch,
  DcmaCheckCommonSettings, DCMA_CHECK_LABELS
} from './dcma-checks.config';

// Per-check advanced settings services (1 is inside common)
import { DcmaCommonSettingsService } from './settings/adv1-settings.service';
import { DcmaAdv2SettingsService } from './settings/adv2-settings.service';
import { DcmaAdv3SettingsService } from './settings/adv3-settings.service';
import { DcmaAdv4SettingsService } from './settings/adv4-settings.service';
import { DcmaAdv5SettingsService } from './settings/adv5-settings.service';
import { DcmaAdv6SettingsService } from './settings/adv6-settings.service';
import { DcmaAdv7SettingsService } from './settings/adv7-settings.service';
import { DcmaAdv8SettingsService } from './settings/adv8-settings.service';
import { DcmaAdv9SettingsService } from './settings/adv9-settings.service';
import { DcmaAdv10SettingsService } from './settings/adv10-settings.service';
import { DcmaAdv11SettingsService } from './settings/adv11-settings.service';
import { DcmaAdv12SettingsService } from './settings/adv12-settings.service';
import { DcmaAdv13SettingsService } from './settings/adv13-settings.service';
import { DcmaAdv14SettingsService } from './settings/adv14-settings.service';

// Advanced type-only imports (barrel)
import type {
  DcmaCheck2Advanced, DcmaCheck3Advanced, DcmaCheck4Advanced, DcmaCheck5Advanced,
  DcmaCheck6Advanced, DcmaCheck7Advanced, DcmaCheck8Advanced, DcmaCheck9Advanced,
  DcmaCheck10Advanced, DcmaCheck11Advanced, DcmaCheck12Advanced, DcmaCheck13Advanced,
  DcmaCheck14Advanced,
} from './types';

// Options type-only imports from analysis services
import type {
  DcmaCheck2Options, DcmaCheck3Options, DcmaCheck4Options, DcmaCheck5Options,
  DcmaCheck6Options, DcmaCheck7Options, DcmaCheck8Options, DcmaCheck9Options,
  DcmaCheck10Options, DcmaCheck11Options, DcmaCheck12Options, DcmaCheck13Options,
  DcmaCheck14Options,
} from '../../../../p6/services/dcma';

// Реэкспорт констант/типов — чтобы сохранить публичный контракт
export { DCMA_IDS, DCMA_CHECK_LABELS };
export type {
  DcmaCheckId, DcmaCheck1AdvancedPatch,
  DcmaCheck2Advanced, DcmaCheck3Advanced, DcmaCheck4Advanced, DcmaCheck5Advanced,
  DcmaCheck6Advanced, DcmaCheck7Advanced, DcmaCheck8Advanced, DcmaCheck9Advanced,
  DcmaCheck10Advanced, DcmaCheck11Advanced, DcmaCheck12Advanced, DcmaCheck13Advanced,
  DcmaCheck14Advanced,
};

// Фасад: единая точка доступа, публичный API прежний
@Injectable({ providedIn: 'root' })
export class DcmaSettingsService {
  constructor(
    private readonly common: DcmaCommonSettingsService,
    private readonly adv2S: DcmaAdv2SettingsService,
    private readonly adv3S: DcmaAdv3SettingsService,
    private readonly adv4S: DcmaAdv4SettingsService,
    private readonly adv5S: DcmaAdv5SettingsService,
    private readonly adv6S: DcmaAdv6SettingsService,
    private readonly adv7S: DcmaAdv7SettingsService,
    private readonly adv8S: DcmaAdv8SettingsService,
    private readonly adv9S: DcmaAdv9SettingsService,
    private readonly adv10S: DcmaAdv10SettingsService,
    private readonly adv11S: DcmaAdv11SettingsService,
    private readonly adv12S: DcmaAdv12SettingsService,
    private readonly adv13S: DcmaAdv13SettingsService,
    private readonly adv14S: DcmaAdv14SettingsService,
  ) {}

  // ===== Общие =====
  get settings() { return this.common.settings; }
  get adv1()      { return this.common.adv1; }

  ensureInitialized(): void {
    this.common.ensureInitialized();
    this.adv2S.ensureInitialized();
    this.adv3S.ensureInitialized();
    this.adv4S.ensureInitialized();
    this.adv5S.ensureInitialized();
    this.adv6S.ensureInitialized();
    this.adv7S.ensureInitialized();
    this.adv8S.ensureInitialized();
    this.adv9S.ensureInitialized();
    this.adv10S.ensureInitialized();
    this.adv11S.ensureInitialized();
    this.adv12S.ensureInitialized();
    this.adv13S.ensureInitialized();
    this.adv14S.ensureInitialized();
  }

  updateOne(id: DcmaCheckId, patch: Partial<DcmaCheckCommonSettings>): void {
    this.common.updateOne(id, patch);
  }

  reset(): void {
    this.common.resetBase();
    this.adv2S.resetAdv2();
    this.adv3S.resetAdv3();
    this.adv4S.resetAdv4();
    this.adv5S.resetAdv5();
    this.adv6S.resetAdv6();
    this.adv7S.resetAdv7();
    this.adv8S.resetAdv8();
    this.adv9S.resetAdv9();
    this.adv10S.resetAdv10();
    this.adv11S.resetAdv11();
    this.adv12S.resetAdv12();
    this.adv13S.resetAdv13();
    this.adv14S.resetAdv14();
  }

  patchAdv1(patch: DcmaCheck1AdvancedPatch): void { this.common.patchAdv1(patch); }

  buildCheck1Options(): {
    excludeCompleted: boolean;
    excludeLoEAndHammock: boolean;
    ignoreLoEAndHammockLinksInLogic: boolean;
    treatMilestonesAsExceptions: boolean;
    includeLists: boolean;
    includeDQ: boolean;
  } {
    return this.common.buildCheck1Options();
  }

  // ===== Check 2 =====
  adv2(): DcmaCheck2Advanced { return this.adv2S.adv2(); }
  patchAdv2(p: Partial<DcmaCheck2Advanced>) { this.adv2S.patchAdv2(p); }
  buildCheck2Options(): DcmaCheck2Options { return this.adv2S.buildCheck2Options(); }
  evaluateCheck2Grade(pct: number) { return this.adv2S.evaluateCheck2Grade(pct); }
  evaluateCheck2Pass(r: { leadCount: number; leadPercent: number; totalLeadHours?: number }) {
    return this.adv2S.evaluateCheck2Pass(r);
  }

  // ===== Check 3 =====
  adv3(): DcmaCheck3Advanced { return this.adv3S.adv3(); }
  patchAdv3(p: Partial<DcmaCheck3Advanced>) { this.adv3S.patchAdv3(p); }
  buildCheck3Options(): DcmaCheck3Options { return this.adv3S.buildCheck3Options(); }
  evaluateCheck3Grade(pct: number) { return this.adv3S.evaluateCheck3Grade(pct); }
  evaluateCheck3Pass(r: { lagCount: number; lagPercent: number; totalLagHours?: number }) {
    return this.adv3S.evaluateCheck3Pass(r);
  }

  // ===== Check 4 =====
  adv4(): DcmaCheck4Advanced { return this.adv4S.adv4(); }
  patchAdv4(p: Partial<DcmaCheck4Advanced>) { this.adv4S.patchAdv4(p); }
  buildCheck4Options(): DcmaCheck4Options { return this.adv4S.buildCheck4Options(); }
  evaluateCheck4Grade(fsPercent: number) { return this.adv4S.evaluateCheck4Grade(fsPercent); }
  evaluateCheck4Pass(fsPercent: number) { return this.adv4S.evaluateCheck4Pass(fsPercent); }

  // ===== Check 5 =====
  adv5(): DcmaCheck5Advanced { return this.adv5S.adv5(); }
  patchAdv5(p: Partial<DcmaCheck5Advanced>): void { this.adv5S.patchAdv5(p); }
  buildCheck5Options(): DcmaCheck5Options { return this.adv5S.buildCheck5Options(); }
  evaluateCheck5Grade(percentHard: number): 'great'|'average'|'poor' { return this.adv5S.evaluateCheck5Grade(percentHard); }
  evaluateCheck5Pass(percentHard: number): boolean { return this.adv5S.evaluateCheck5Pass(percentHard); }

  // ===== Check 6 =====
  adv6(): DcmaCheck6Advanced { return this.adv6S.adv6(); }
  patchAdv6(p: Partial<DcmaCheck6Advanced>) { this.adv6S.patchAdv6(p); }
  buildCheck6Options(): DcmaCheck6Options { return this.adv6S.buildCheck6Options(); }
  evaluateCheck6Grade(percentHighFloat: number) { return this.adv6S.evaluateCheck6Grade(percentHighFloat); }
  evaluateCheck6Pass(percentHighFloat: number) { return this.adv6S.evaluateCheck6Pass(percentHighFloat); }

  // ===== Check 7 =====
  adv7(): DcmaCheck7Advanced { return this.adv7S.adv7(); }
  patchAdv7(p: Partial<DcmaCheck7Advanced>) { this.adv7S.patchAdv7(p); }
  buildCheck7Options(): DcmaCheck7Options { return this.adv7S.buildCheck7Options(); }
  evaluateCheck7Grade(r: { negativeFloatCount: number; totalEligible: number }) {
    return this.adv7S.evaluateCheck7Grade(r.negativeFloatCount, r.totalEligible);
  }
  evaluateCheck7Pass(r: { negativeFloatCount: number; totalEligible: number }) {
    return this.adv7S.evaluateCheck7Pass(r.negativeFloatCount, r.totalEligible);
  }

  // ===== Check 8 =====
  adv8(): DcmaCheck8Advanced { return this.adv8S.adv8(); }
  patchAdv8(p: Partial<DcmaCheck8Advanced>) { this.adv8S.patchAdv8(p); }
  buildCheck8Options(): DcmaCheck8Options { return this.adv8S.buildCheck8Options(); }
  evaluateCheck8Grade(percentHighRemain: number) { return this.adv8S.evaluateCheck8Grade(percentHighRemain); }
  evaluateCheck8Pass(percentHighRemain: number) { return this.adv8S.evaluateCheck8Pass(percentHighRemain); }

  // ===== Check 9 =====
  adv9(): DcmaCheck9Advanced { return this.adv9S.adv9(); }
  patchAdv9(p: Partial<DcmaCheck9Advanced>) { this.adv9S.patchAdv9(p); }
  buildCheck9Options(): DcmaCheck9Options { return this.adv9S.buildCheck9Options(); }
  evaluateCheck9Grade(invalidCount: number) { return this.adv9S.evaluateCheck9Grade(invalidCount); }
  evaluateCheck9Pass(invalidCount: number) { return this.adv9S.evaluateCheck9Pass(invalidCount); }

  // ===== Check 10 =====
  adv10(): DcmaCheck10Advanced { return this.adv10S.adv10(); }
  patchAdv10(p: Partial<DcmaCheck10Advanced>) { this.adv10S.patchAdv10(p); }
  buildCheck10Options(): DcmaCheck10Options { return this.adv10S.buildCheck10Options(); }
  evaluateCheck10Grade(percentWithoutRes: number) { return this.adv10S.evaluateCheck10Grade(percentWithoutRes); }
  evaluateCheck10Pass(percentWithoutRes: number) { return this.adv10S.evaluateCheck10Pass(percentWithoutRes); }

  // ===== Check 11 =====
  adv11(): DcmaCheck11Advanced { return this.adv11S.adv11(); }
  patchAdv11(p: Partial<DcmaCheck11Advanced>) { this.adv11S.patchAdv11(p); }
  buildCheck11Options(): DcmaCheck11Options { return this.adv11S.buildCheck11Options(); }
  evaluateCheck11Grade(percentMissed: number) { return this.adv11S.evaluateCheck11Grade(percentMissed); }
  evaluateCheck11Pass(percentMissed: number) { return this.adv11S.evaluateCheck11Pass(percentMissed); }

  // ===== Check 12 =====
  adv12(): DcmaCheck12Advanced { return this.adv12S.adv12(); }
  patchAdv12(p: Partial<DcmaCheck12Advanced>) { this.adv12S.patchAdv12(p); }
  buildCheck12Options(): DcmaCheck12Options { return this.adv12S.buildCheck12Options(); }
  evaluateCheck12Grade(ok: boolean) { return this.adv12S.evaluateCheck12Grade(ok); }
  evaluateCheck12Pass(ok: boolean) { return this.adv12S.evaluateCheck12Pass(ok); }

  // ===== Check 13 =====
  adv13(): DcmaCheck13Advanced { return this.adv13S.adv13(); }
  patchAdv13(p: Partial<DcmaCheck13Advanced>) { this.adv13S.patchAdv13(p); }
  buildCheck13Options(): DcmaCheck13Options { return this.adv13S.buildCheck13Options(); }
  evaluateCheck13Grade(cpli: number | null) { return this.adv13S.evaluateCheck13Grade(cpli); }
  evaluateCheck13Pass(cpli: number | null) { return this.adv13S.evaluateCheck13Pass(cpli); }

  // ===== Check 14 =====
  adv14(): DcmaCheck14Advanced { return this.adv14S.adv14(); }
  patchAdv14(p: Partial<DcmaCheck14Advanced>) { this.adv14S.patchAdv14(p); }
  buildCheck14Options(): DcmaCheck14Options { return this.adv14S.buildCheck14Options(); }
  evaluateCheck14Grade(bei: number | null) { return this.adv14S.evaluateCheck14Grade(bei); }
  evaluateCheck14Pass(bei: number | null) { return this.adv14S.evaluateCheck14Pass(bei); }
}