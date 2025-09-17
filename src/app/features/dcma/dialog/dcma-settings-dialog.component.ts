// src/app/features/dcma/dialog/dcma-settings-dialog.component.ts
import { Component, Inject, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { DcmaSettingsService, DcmaCheckId, DCMA_IDS } from '../services/dcma-settings.service';

const CHECK_LABELS: Record<DcmaCheckId, string> = {
  1:'Logic',2:'Leads',3:'Lags',4:'Relationship Types',5:'Hard Constraints',
  6:'High Float',7:'Negative Float',8:'High Duration',9:'Invalid Dates',
  10:'Resources',11:'Missed Tasks',12:'Critical Path Test',13:'CPLI',14:'BEI',
};

@Component({
  standalone: true,
  selector: 'app-dcma-settings-dialog',
  imports: [CommonModule, MatDialogModule, MatListModule, MatSlideToggleModule, MatIconModule, MatButtonModule],
  styleUrls: ['./dcma-settings-dialog.component.scss'],
  template: `...` // без изменений разметки
})
export class DcmaSettingsDialogComponent {
  readonly ids: readonly DcmaCheckId[] = DCMA_IDS;
  readonly labels = CHECK_LABELS;

  private readonly svc = inject(DcmaSettingsService);
  private readonly dialogRef = inject(MatDialogRef<DcmaSettingsDialogComponent>);

  constructor(@Inject(MAT_DIALOG_DATA) public data: { startCheckId?: number } | null) {
    const start = (this.ids.includes((data?.startCheckId as DcmaCheckId) ?? 1 as DcmaCheckId)
      ? (data?.startCheckId as DcmaCheckId) : 1) as DcmaCheckId;
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
