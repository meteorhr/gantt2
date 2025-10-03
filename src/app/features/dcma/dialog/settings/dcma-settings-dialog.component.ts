import { Component, Inject, computed, signal, inject, ChangeDetectionStrategy, ViewChild, ElementRef, Injectable, SkipSelf } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaSettingsService, DcmaCheckId, DCMA_IDS, DCMA_CHECK_LABELS } from '../../services/adv/dcma-settings.service';

import { DcmaEmptySettingsPaneComponent } from './panes/empty-settings-pane.component';
import { DcmaCheck1SettingsPaneComponent } from './panes/check1-settings-pane.component';
import { DcmaCheck2SettingsPaneComponent } from './panes/check2-settings-pane.component';
import { DcmaCheck3SettingsPaneComponent } from './panes/check3-settings-pane.component';
import { DcmaCheck4SettingsPaneComponent } from './panes/check4-settings-pane.component';
import { DcmaCheck5SettingsPaneComponent } from './panes/check5-settings-pane.component';
import { DcmaCheck6SettingsPaneComponent } from './panes/check6-settings-pane.component';
import { DcmaCheck7SettingsPaneComponent } from './panes/check7-settings-pane.component';
import { DcmaCheck8SettingsPaneComponent } from './panes/check8-settings-pane.component';
import { DcmaCheck9SettingsPaneComponent } from './panes/check9-settings-pane.component';
import { DcmaCheck10SettingsPaneComponent } from './panes/check10-settings-pane.component';
import { DcmaCheck11SettingsPaneComponent } from './panes/check11-settings-pane.component';
import { DcmaCheck12SettingsPaneComponent } from './panes/check12-settings-pane.component';
import { DcmaCheck13SettingsPaneComponent } from './panes/check13-settings-pane.component';
import { DcmaCheck14SettingsPaneComponent } from './panes/check14-settings-pane.component';

/* ============================
   Черновой фасад настроек (Draft)
   ============================ */

type SettingsMap = ReturnType<DcmaSettingsService['settings']>;

@Injectable()
class DcmaSettingsDraftFacade {
  private _draft: SettingsMap;
  private _adv: any;

  // снимки для Reset (без затрагивания live)
  private _draftInit: SettingsMap;
  private _advInit: any;

  constructor(@SkipSelf() private live: DcmaSettingsService) {
    const liveSettings = this.safeClone(live.settings());
    const liveAdv = this.safeClone({
      adv1:  live.adv1?.(),
      adv2:  live.adv2?.(),
      adv3:  live.adv3?.(),
      adv4:  live.adv4?.(),
      adv5:  live.adv5?.(),
      adv6:  live.adv6?.(),
      adv7:  live.adv7?.(),
      adv8:  live.adv8?.(),
      adv9:  live.adv9?.(),
      adv10: live.adv10?.(),
      adv11: live.adv11?.(),
      adv12: live.adv12?.(),
      adv13: live.adv13?.(),
      adv14: live.adv14?.(),
    });

    this._draft = liveSettings;
    this._adv = liveAdv;

    // baseline для reset
    this._draftInit = this.safeClone(liveSettings);
    this._advInit = this.safeClone(liveAdv);
  }

  /* ——— чтение ——— */
  settings(): SettingsMap { return this._draft; }
  adv1()  { return this._adv.adv1; }
  adv2()  { return this._adv.adv2; }
  adv3()  { return this._adv.adv3; }
  adv4()  { return this._adv.adv4; }
  adv5()  { return this._adv.adv5; }
  adv6()  { return this._adv.adv6; }
  adv7()  { return this._adv.adv7; }
  adv8()  { return this._adv.adv8; }
  adv9()  { return this._adv.adv9; }
  adv10() { return this._adv.adv10; }
  adv11() { return this._adv.adv11; }
  adv12() { return this._adv.adv12; }
  adv13() { return this._adv.adv13; }
  adv14() { return this._adv.adv14; }

  /* ——— запись ——— */
  updateOne(id: DcmaCheckId, patch: Partial<SettingsMap[DcmaCheckId]>) {
    this._draft[id] = { ...this._draft[id], ...patch };
  }

  /** Универсальный глУБОКИЙ патч adv[id] */
  updateAdv(id: DcmaCheckId, patch: any) {
    const key = `adv${id}` as const;
    const current = this.safeClone(this._adv[key] ?? {});
    const merged  = this.deepMerge(current, this.safeClone(patch));
    this._adv[key] = merged;
  }

  /** Полная замена adv[id] */
  setAdv(id: DcmaCheckId, value: any) {
    const key = `adv${id}` as const;
    this._adv[key] = this.safeClone(value);
  }

  /* ==========
     Алиасы под разные возможные вызовы из панелей
     ========== */
  patchAdv(id: DcmaCheckId, patch: any) { this.updateAdv(id, patch); }
  setAdv1(v:any){ this.setAdv(1 as DcmaCheckId, v); }
  setAdv2(v:any){ this.setAdv(2 as DcmaCheckId, v); }
  setAdv3(v:any){ this.setAdv(3 as DcmaCheckId, v); }
  setAdv4(v:any){ this.setAdv(4 as DcmaCheckId, v); }
  setAdv5(v:any){ this.setAdv(5 as DcmaCheckId, v); }
  setAdv6(v:any){ this.setAdv(6 as DcmaCheckId, v); }
  setAdv7(v:any){ this.setAdv(7 as DcmaCheckId, v); }
  setAdv8(v:any){ this.setAdv(8 as DcmaCheckId, v); }
  setAdv9(v:any){ this.setAdv(9 as DcmaCheckId, v); }
  setAdv10(v:any){ this.setAdv(10 as DcmaCheckId, v); }
  setAdv11(v:any){ this.setAdv(11 as DcmaCheckId, v); }
  setAdv12(v:any){ this.setAdv(12 as DcmaCheckId, v); }
  setAdv13(v:any){ this.setAdv(13 as DcmaCheckId, v); }
  setAdv14(v:any){ this.setAdv(14 as DcmaCheckId, v); }

  updateAdv1(p:any){ this.updateAdv(1 as DcmaCheckId, p); }
  updateAdv2(p:any){ this.updateAdv(2 as DcmaCheckId, p); }
  updateAdv3(p:any){ this.updateAdv(3 as DcmaCheckId, p); }
  updateAdv4(p:any){ this.updateAdv(4 as DcmaCheckId, p); }
  updateAdv5(p:any){ this.updateAdv(5 as DcmaCheckId, p); }
  updateAdv6(p:any){ this.updateAdv(6 as DcmaCheckId, p); }
  updateAdv7(p:any){ this.updateAdv(7 as DcmaCheckId, p); }
  updateAdv8(p:any){ this.updateAdv(8 as DcmaCheckId, p); }
  updateAdv9(p:any){ this.updateAdv(9 as DcmaCheckId, p); }
  updateAdv10(p:any){ this.updateAdv(10 as DcmaCheckId, p); }
  updateAdv11(p:any){ this.updateAdv(11 as DcmaCheckId, p); }
  updateAdv12(p:any){ this.updateAdv(12 as DcmaCheckId, p); }
  updateAdv13(p:any){ this.updateAdv(13 as DcmaCheckId, p); }
  updateAdv14(p:any){ this.updateAdv(14 as DcmaCheckId, p); }

  // КЛЮЧЕВОЕ: поддержка patchAdvX(...) — именно этого не хватало
  patchAdv1(p:any){ this.updateAdv1(p); }
  patchAdv2(p:any){ this.updateAdv2(p); }
  patchAdv3(p:any){ this.updateAdv3(p); }
  patchAdv4(p:any){ this.updateAdv4(p); }
  patchAdv5(p:any){ this.updateAdv5(p); }
  patchAdv6(p:any){ this.updateAdv6(p); }
  patchAdv7(p:any){ this.updateAdv7(p); }
  patchAdv8(p:any){ this.updateAdv8(p); }
  patchAdv9(p:any){ this.updateAdv9(p); }
  patchAdv10(p:any){ this.updateAdv10(p); }
  patchAdv11(p:any){ this.updateAdv11(p); }
  patchAdv12(p:any){ this.updateAdv12(p); }
  patchAdv13(p:any){ this.updateAdv13(p); }
  patchAdv14(p:any){ this.updateAdv14(p); }

  /** Reset только черновика (не трогаем live) */
  reset() {
    this._draft = this.safeClone(this._draftInit);
    this._adv   = this.safeClone(this._advInit);
  }

  /** Commit: переносим черновик в live пакетно */
  commit() {
    (Object.keys(this._draft) as unknown as DcmaCheckId[]).forEach(id => {
      this.live.updateOne(id, this._draft[id]);
    });

    for (let id = 1 as DcmaCheckId; id <= 14; id = (id + 1) as DcmaCheckId) {
      const key = `adv${id}` as const;
      const val = this._adv[key];
      if (val == null) continue;

      if ((this.live as any).updateAdv) {
        (this.live as any).updateAdv(id, this.safeClone(val));
        continue;
      }
      const specific = (this.live as any)[`updateAdv${id}`] || (this.live as any)[`patchAdv${id}`] || (this.live as any)[`setAdv${id}`];
      if (typeof specific === 'function') {
        specific.call(this.live, this.safeClone(val));
      }
    }
  }

  /* ——— утилиты ——— */
  private safeClone<T>(v: T): T {
    try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
  }
  private isPlainObject(v:any){ return v && typeof v === 'object' && !Array.isArray(v); }
  private deepMerge<T>(target:T, source:any): T {
    if (!this.isPlainObject(source)) return source ?? target;
    const out:any = this.safeClone(target) || {};
    for (const k of Object.keys(source)) {
      if (this.isPlainObject(source[k])) {
        out[k] = this.deepMerge(out[k], source[k]);
      } else {
        out[k] = source[k];
      }
    }
    return out;
  }
}

/* ============================
   Сам диалог
   ============================ */

@Component({
  standalone: true,
  selector: 'app-dcma-settings-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: DcmaSettingsService, useClass: DcmaSettingsDraftFacade } // подмена только в диалоге
  ],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatListModule,
    MatSlideToggleModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    TranslocoModule,

    DcmaEmptySettingsPaneComponent,
    DcmaCheck1SettingsPaneComponent,
    DcmaCheck2SettingsPaneComponent,
    DcmaCheck3SettingsPaneComponent,
    DcmaCheck4SettingsPaneComponent,
    DcmaCheck5SettingsPaneComponent,
    DcmaCheck6SettingsPaneComponent,
    DcmaCheck7SettingsPaneComponent,
    DcmaCheck8SettingsPaneComponent,
    DcmaCheck9SettingsPaneComponent,
    DcmaCheck10SettingsPaneComponent,
    DcmaCheck11SettingsPaneComponent,
    DcmaCheck12SettingsPaneComponent,
    DcmaCheck13SettingsPaneComponent,
    DcmaCheck14SettingsPaneComponent
  ],
  styleUrls: ['./dcma-settings-dialog.component.scss'],
  templateUrl: './dcma-settings-dialog.component.html',
})
export class DcmaSettingsDialogComponent {
  readonly ids: readonly DcmaCheckId[] = DCMA_IDS;
  readonly labels = DCMA_CHECK_LABELS;

  private readonly svc = inject(DcmaSettingsService); // это уже DraftFacade
  private readonly dialogRef = inject(MatDialogRef<DcmaSettingsDialogComponent>);

  @ViewChild('rightPane') rightPane?: ElementRef<HTMLElement>;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { startCheckId?: number } | null) {
    const inRange = (this.ids as readonly number[]).includes((data?.startCheckId as number) ?? 1);
    const start = (inRange ? (data?.startCheckId as DcmaCheckId) : 1) as DcmaCheckId;
    this.selected.set(start);
  }

  /** Прокрутка правой панели к началу */
  private scrollRightPaneTop(): void {
    const el = this.rightPane?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'auto' });
    try { (el as HTMLElement).focus({ preventScroll: true } as any); } catch {}
  }
  private scheduleScrollTop(): void {
    if (typeof window === 'undefined') return;
    const cb = () => this.scrollRightPaneTop();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
    else setTimeout(cb, 0);
  }

  selected = signal<DcmaCheckId>(1);
  currentId = computed(() => this.selected());

  select(id: DcmaCheckId): void {
    this.selected.set(id);
    this.scheduleScrollTop();
  }

  curEnabled = computed(() => this.svc.settings()[this.selected()].enabled);
  curShown   = computed(() => this.svc.settings()[this.selected()].showInTable);

  onToggleEnabled(v: boolean): void {
    const id = this.selected();
    this.svc.updateOne(id, { enabled: v });
    if (!v) this.svc.updateOne(id, { showInTable: false });
  }
  onToggleShown(v: boolean): void {
    this.svc.updateOne(this.selected(), { showInTable: v });
  }

  reset(): void {
    (this.svc as unknown as DcmaSettingsDraftFacade).reset();
  }

  close(saved: boolean): void {
    if (saved) {
      (this.svc as unknown as DcmaSettingsDraftFacade).commit();
    }
    this.dialogRef.close({ saved });
  }
}
