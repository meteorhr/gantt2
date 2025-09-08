import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AppStateService } from '../../state/app-state.service';

@Component({
  selector: 'sv-dashboard-tab',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressBarModule,
  ],
  styleUrls: ['./dashboard-tab.component.scss'],
  templateUrl: './dashboard-tab.component.html',
})
export class DashboardTabComponent implements OnInit {
  readonly wm = inject(AppStateService);

  // Число уникальных rsrc_id (без пустого значения '—'), вынесено из шаблона
  readonly nonEmptyRsrcCount = computed(() => {
    const d = this.wm.dashboard();
    return d ? d.byRsrcId.filter(x => x.value !== '—').length : 0;
  });

  async ngOnInit(): Promise<void> {
    // пересчёт КАЖДЫЙ раз при заходе на вкладку
    await this.wm.computeDashboard();
  }

  top(list: { value: string; count: number }[]): string {
    if (!list.length) return '—';
    const m = list.reduce((acc, x) => (x.count > acc.count ? x : acc), list[0]);
    return `${m.value}: ${m.count}`;
  }
}
