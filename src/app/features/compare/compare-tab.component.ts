import { AfterViewInit, Component, OnInit, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { AppStateService } from '../../state/app-state.service';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { CompareService } from '../../p6/services/compare.service';
import { MatTableModule } from '@angular/material/table';
import { CostCompareTableComponent } from './shared/cost-compare-table';
import { RsrcQtyCompareTableComponent } from './shared/rsrc-qty-compare-table';
import { IndexCompareTableComponent } from './shared/index-compare-table';
import { DateCompareTableComponent  } from './shared/date/date-compare-table.component';
import { ProgressCompareTableComponent } from './shared/progress/progress-compare-table.component'

@Component({
  selector: 'sv-gantt-tab',
  standalone: true,
  imports: [
    TranslocoModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatButtonModule,
    //CostCompareTableComponent,
    //RsrcQtyCompareTableComponent,
    //IndexCompareTableComponent,
    DateCompareTableComponent,
    ProgressCompareTableComponent
  ],
  templateUrl: './compare-tab.component.html',
  styleUrls: ['./compare-tab.component.scss']
})
export class CompareTabComponent implements AfterViewInit, OnInit {
  readonly wm = inject(AppStateService);
  private readonly compareSvc = inject(CompareService);


  baseLabel = '—';
  candidateLabel = '—';

  compareResult: any = null;
  errorMsgKey: string | null = null;  // ключ Transloco для ошибок
  compareRunning = false;

  /** Счётчик запусков сравнения для защиты от гонок */
  private compareSeq = 0;

  constructor() {}

  async ngOnInit(): Promise<void> {
    await this.onCompare();
  }

  /**
   * Запуск сравнения.
   * Гард-условия: выбран base, загружен/выбран candidate.
   * Защита от гонок: учитываем compareSeq.
   */
  async onCompare(): Promise<void> {
    const seq = ++this.compareSeq;

    this.errorMsgKey = null;
    this.compareResult = null;

    const baseIdRaw = this.wm.selectedProjectId?.();
    const candidateIdRaw = this.wm.selectedProjectIdCandidate?.();
    const candidateList = this.wm.projectsCandidate?.() as Array<any> | null;
    const projects = this.wm.projects?.() as Array<any> | null;

    const baseId = this.toFiniteNumberOrNull(baseIdRaw);
    const candidateId = this.toFiniteNumberOrNull(candidateIdRaw);
    const hasCandidateProjects = Array.isArray(candidateList) && candidateList.length > 0;

    if (!baseId) {
      this.errorMsgKey = 'compare.errors.no_base_selected';
      return;
    }

    if (!hasCandidateProjects || !candidateId) {
      // «Кандидат не найден/не выбран» — отдельный информер в шаблоне
      this.errorMsgKey = 'compare.errors.no_candidate_selected_or_loaded';
      return;
    }

    this.baseLabel = this.computeProjectLabel(projects, baseId);
    this.candidateLabel = this.computeProjectLabel(candidateList, candidateId);

    this.compareRunning = true;
    try {
      // Пересчитываем актуальные снапшоты
      await Promise.all([
        this.wm.computeDashboard(baseId, {
          candidate: false,
          prefix: '',
          variantName: 'base'
        }) as Promise<any>,
        this.wm.computeDashboard(candidateId, {
          candidate: true,
          prefix: 'C_',
          variantName: 'candidate'
        }) as Promise<any>
      ]);

      // Если за время ожидания стартовал новый compare — выходим без перезаписи стейта
      if (seq !== this.compareSeq) return;

      const baseObj: any = this.wm.dashboard?.();
      const candObj: any = this.wm.dashboardCandidate?.();

      if (!baseObj) {
        this.errorMsgKey = 'compare.errors.base_snapshot_missing';
        return;
      }
      if (!candObj) {
        this.errorMsgKey = 'compare.errors.candidate_snapshot_missing';
        return;
      }

      this.compareResult = this.compareSvc.compare(baseObj, candObj, {
        round: 3,
        deltaOnly: false
      });

      console.log(this.compareResult)
    } catch (e) {
      console.error('Compare error', e);
      this.errorMsgKey = 'compare.errors.failed';
    } finally {
      // Сбрасываем индикатор только если это последний активный запуск
      if (seq === this.compareSeq) {
        this.compareRunning = false;
      }
    }
  }

  /**
   * Загрузка файла кандидата прямо с вкладки сравнения
   * с авто-перезапуском сравнения.
   */
  async onCandidateFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input?.files && input.files.length ? input.files[0] : null;

    if (!file) return;

    try {
      await this.wm.loadFromFile(file, { candidate: true });
      await this.onCompare();
    } catch (e) {
      console.error('Compare error', e);
      this.errorMsgKey = 'compare.errors.failed';
    } finally {
      if (input) input.value = '';
    }
  }

  ngAfterViewInit(): void {}

  /** Привести к конечному числу или вернуть null */
  private toFiniteNumberOrNull(x: unknown): number | null {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  private computeProjectLabel(list: Array<any> | null | undefined, id: number | null): string {
    if (!id) return '—';
    const p = list?.find(r => Number(r?.proj_id) === id) ?? null;
    const name = (p?.proj_short_name ?? '').toString().trim();
    return name ? name : `#${id}`;
  }
}
