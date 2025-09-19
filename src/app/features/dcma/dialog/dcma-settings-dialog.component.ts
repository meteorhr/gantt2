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
import { DcmaSettingsService, DcmaCheckId, DCMA_IDS, DcmaCheck1Advanced, DcmaCheck1AdvancedPatch } from '../services/dcma-settings.service';

const CHECK_LABELS: Record<DcmaCheckId, string> = {
  1:'Logic',2:'Leads',3:'Lags',4:'Relationship Types',5:'Hard Constraints',
  6:'High Float',7:'Negative Float',8:'High Duration',9:'Invalid Dates',
  10:'Resources',11:'Missed Tasks',12:'Critical Path Test',13:'CPLI',14:'BEI',
};

@Component({
  standalone: true,
  selector: 'app-dcma-settings-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatDialogModule, MatListModule, MatSlideToggleModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDividerModule],
  styleUrls: ['./dcma-settings-dialog.component.scss'],
  templateUrl: './dcma-settings-dialog.component.html',
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

  adv1 = computed(() => this.svc.adv1());

  private clampPct(n: number): number { return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; }
  onGreatPct(v: string): void {
    const n = this.clampPct(Number(v));
    this.svc.patchAdv1({ thresholds: { greatPct: n } });
  }
  onAvgPct(v: string): void {
    const n = this.clampPct(Number(v));
    this.svc.patchAdv1({ thresholds: { averagePct: n } });
  }
  patchAdv1(patch: DcmaCheck1AdvancedPatch): void {
    this.svc.patchAdv1(patch);
  }

  thresholdGradient(): string {
    const a = this.svc.adv1();
    const gp = this.clampPct(a.thresholds.greatPct);
    const ap = this.clampPct(a.thresholds.averagePct);
    // зеленый до great, желтый между great..average, красный дальше
    const g = '#4CAF50'; // Material Green 500
    const y = '#FFC107'; // Amber 500
    const r = '#EF5350'; // Red 400
    if (ap <= gp) {
      return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    }
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}