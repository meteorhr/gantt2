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
  template: `<h2 mat-dialog-title class="dlg-title">
      <mat-icon>tune</mat-icon>
      <span>Настройки DCMA</span>
    </h2>

    <mat-dialog-content>
    <div class="dlg-body split-scroll" role="group" aria-label="DCMA settings split panes">
      <nav class="left-nav" aria-label="DCMA checks">
        <mat-nav-list>
          @for (id of ids; track id) {
            <a mat-list-item
               (click)="select(id)"
               [class.active]="selected() === id"
               [attr.aria-selected]="selected() === id"
               [attr.aria-controls]="'pane-' + id"
               role="tab">
              <span class="num">{{ id }}</span>
              <span class="label">{{ labels[id] }}</span>
            </a>
          }
        </mat-nav-list>
      </nav>

      <section class="right-pane" *ngIf="currentId() as cid" [attr.id]="'pane-' + cid" role="tabpanel" tabindex="0">
        <header class="pane-header sticky">
          <div class="title">
            <span class="cid">Check {{ cid }}</span>
            <span class="cname">{{ labels[cid] }}</span>
          </div>
        </header>

        <div class="form">
          <mat-slide-toggle
            [checked]="curEnabled()"
            (change)="onToggleEnabled($event.checked)"
            aria-label="Включить анализ"
          >
            Включить анализ
          </mat-slide-toggle>

          <mat-slide-toggle
            [checked]="curShown()"
            (change)="onToggleShown($event.checked)"
            [disabled]="!curEnabled()"
            aria-label="Показывать в таблице"
          >
            Показывать в таблице
          </mat-slide-toggle>
        </div>

        @if (cid === 1) {
          <mat-divider></mat-divider>
          <h4 class="section-title">Visibility</h4>
          <div class="row-line">
            <div class="row-text">
              <div class="row-title">Show this Health check to the main screen</div>
            </div>
            <mat-slide-toggle
              [checked]="adv1().showOnMain"
              (change)="patchAdv1({ showOnMain: $event.checked })"
              aria-label="Show on main screen">
            </mat-slide-toggle>
          </div>

          <h4 class="section-title">Activity Filters</h4>
          <div class="row-line">
            <div class="row-text"><div class="row-title">Task/resource dependent activities</div></div>
            <mat-slide-toggle
              [checked]="adv1().includeTaskResDep"
              (change)="patchAdv1({ includeTaskResDep: $event.checked })">
            </mat-slide-toggle>
          </div>
          <div class="row-line">
            <div class="row-text"><div class="row-title">Milestones</div></div>
            <mat-slide-toggle
              [checked]="adv1().includeMilestones"
              (change)="patchAdv1({ includeMilestones: $event.checked })">
            </mat-slide-toggle>
          </div>
          <div class="row-line">
            <div class="row-text"><div class="row-title">Level of effort activities</div></div>
            <mat-slide-toggle
              [checked]="adv1().includeLoE"
              (change)="patchAdv1({ includeLoE: $event.checked })">
            </mat-slide-toggle>
          </div>
          <div class="row-line">
            <div class="row-text"><div class="row-title">WBS summary activities</div></div>
            <mat-slide-toggle
              [checked]="adv1().includeWbsSummary"
              (change)="patchAdv1({ includeWbsSummary: $event.checked })">
            </mat-slide-toggle>
          </div>
          <div class="row-line">
            <div class="row-text"><div class="row-title">Completed activities</div></div>
            <mat-slide-toggle
              [checked]="adv1().includeCompleted"
              (change)="patchAdv1({ includeCompleted: $event.checked })">
            </mat-slide-toggle>
          </div>
          <div class="row-line">
            <div class="row-text"><div class="row-title">Obsolete activities</div></div>
            <mat-slide-toggle
              [checked]="adv1().includeObsolete"
              (change)="patchAdv1({ includeObsolete: $event.checked })"
              [disabled]="true">
            </mat-slide-toggle>
          </div>

          <h4 class="section-title">Threshold levels</h4>
          <div class="row-line">
            <div class="row-text"><div class="row-title">Great Performance</div></div>
            <mat-form-field appearance="outline" class="pct-field">
              <input matInput type="number" min="0" max="100" step="1"
                     [value]="adv1().thresholds.greatPct"
                     (input)="onGreatPct($any($event.target).value)">
              <span matTextSuffix>%</span>
            </mat-form-field>
          </div>
          <div class="row-line">
            <div class="row-text"><div class="row-title">Average Performance</div></div>
            <mat-form-field appearance="outline" class="pct-field">
              <input matInput type="number" min="0" max="100" step="1"
                     [value]="adv1().thresholds.averagePct"
                     (input)="onAvgPct($any($event.target).value)">
              <span matTextSuffix>%</span>
            </mat-form-field>
          </div>

          <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
        }
      </section>
    </div>
    </mat-dialog-content>

    <mat-dialog-actions>
      <button mat-stroked-button color="primary" (click)="reset()">
        <mat-icon>restart_alt</mat-icon>
        Сбросить по умолчанию
      </button>
      <span class="fx"></span>
      <button mat-button (click)="close(false)">Отмена</button>
      <button mat-flat-button color="primary" (click)="close(true)">Готово</button>
    </mat-dialog-actions>` // без изменений разметки
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
