import { Component, Inject, computed, signal, inject, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
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

import { DcmaSettingsService, DcmaCheckId, DCMA_IDS, DCMA_CHECK_LABELS } from '../../services/adv/dcma-settings.service';
import { DcmaCheck1SettingsPaneComponent } from './panes/check1-settings-pane.component';
import { DcmaEmptySettingsPaneComponent } from './panes/empty-settings-pane.component';
import { TranslocoModule } from '@jsverse/transloco';
import { DcmaCheck2SettingsPaneComponent } from './panes/check2-settings-pane.component';
import { DcmaCheck3SettingsPaneComponent } from './panes/check3-settings-pane.component';
import { DcmaCheck4SettingsPaneComponent } from './panes/check4-settings-pane.component';
import { DcmaCheck5SettingsPaneComponent } from './panes/check5-settings-pane.component';
import { DcmaCheck6SettingsPaneComponent } from './panes/check6-settings-pane.component';
import { DcmaCheck7SettingsPaneComponent } from './panes/check7-settings-pane.component';
import { DcmaCheck8SettingsPaneComponent } from './panes/check8-settings-pane.component';
import { DcmaCheck10SettingsPaneComponent } from './panes/check10-settings-pane.component';
import { DcmaCheck9SettingsPaneComponent } from './panes/check9-settings-pane.component';
import { DcmaCheck11SettingsPaneComponent } from './panes/check11-settings-pane.component';
import { DcmaCheck12SettingsPaneComponent } from './panes/check12-settings-pane.component';
import { DcmaCheck13SettingsPaneComponent } from './panes/check13-settings-pane.component';
import { DcmaCheck14SettingsPaneComponent } from './panes/check14-settings-pane.component';

// Подключаем панельки (отдельные файлы)

@Component({
  standalone: true,
  selector: 'app-dcma-settings-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  private readonly svc = inject(DcmaSettingsService);
  private readonly dialogRef = inject(MatDialogRef<DcmaSettingsDialogComponent>);
  @ViewChild('rightPane') rightPane?: ElementRef<HTMLElement>;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { startCheckId?: number } | null) {
    const inRange = (this.ids as readonly number[]).includes((data?.startCheckId as number) ?? 1);
    const start = (inRange ? (data?.startCheckId as DcmaCheckId) : 1) as DcmaCheckId;
    this.selected.set(start);
  }

  /** Прокрутить правую колонку (панель настроек) к началу */
  private scrollRightPaneTop(): void {
    const el = this.rightPane?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'auto' });
    // для доступности вернём фокус без дополнительной прокрутки
    try { (el as HTMLElement).focus({ preventScroll: true } as any); } catch {}
  }

  /** Запланировать прокрутку после обновления шаблона */
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

  reset(): void { this.svc.reset(); }
  close(saved: boolean): void { this.dialogRef.close({ saved }); }
}
