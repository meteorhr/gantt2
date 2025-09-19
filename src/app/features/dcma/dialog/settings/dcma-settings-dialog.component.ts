import { Component, Inject, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core';
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

import { DcmaSettingsService, DcmaCheckId, DCMA_IDS, DCMA_CHECK_LABELS } from '../../services/dcma-settings.service';
import { DcmaCheck1SettingsPaneComponent } from './panes/check1-settings-pane.component';
import { DcmaEmptySettingsPaneComponent } from './panes/empty-settings-pane.component';
import { TranslocoModule } from '@jsverse/transloco';
import { DcmaCheck2SettingsPaneComponent } from './panes/check2-settings-pane.component';

// Подключаем панельки (отдельные файлы)

@Component({
  standalone: true,
  selector: 'app-dcma-settings-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatListModule, MatSlideToggleModule,
    MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDividerModule,
    DcmaCheck1SettingsPaneComponent, DcmaEmptySettingsPaneComponent, TranslocoModule, DcmaCheck2SettingsPaneComponent
  ],
  styleUrls: ['./dcma-settings-dialog.component.scss'],
  templateUrl: './dcma-settings-dialog.component.html',
})
export class DcmaSettingsDialogComponent {
  readonly ids: readonly DcmaCheckId[] = DCMA_IDS;
  readonly labels = DCMA_CHECK_LABELS;

  private readonly svc = inject(DcmaSettingsService);
  private readonly dialogRef = inject(MatDialogRef<DcmaSettingsDialogComponent>);

  constructor(@Inject(MAT_DIALOG_DATA) public data: { startCheckId?: number } | null) {
    const inRange = (this.ids as readonly number[]).includes((data?.startCheckId as number) ?? 1);
    const start = (inRange ? (data?.startCheckId as DcmaCheckId) : 1) as DcmaCheckId;
    this.selected.set(start);
  }

  selected = signal<DcmaCheckId>(1);
  currentId = computed(() => this.selected());

  select(id: DcmaCheckId): void { this.selected.set(id); }

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
