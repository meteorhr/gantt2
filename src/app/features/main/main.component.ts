import { Component, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';

import { TranslocoModule } from '@jsverse/transloco';
import { AppStateService } from '../../state/app-state.service';
import { UploadDialogComponent } from './upload-dialog.component';

// ➕ сигналы из RxJS для адаптивной ширины
import { toSignal } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { debounceTime, map, startWith } from 'rxjs/operators';
import { AnalyticsService } from '../../firebase/analytics.service';

@Component({
  selector: 'sv-main',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,

    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatTabsModule,
    MatProgressBarModule,
    MatCardModule,
  ],
  styleUrls: ['./main.component.scss'],
  template: `
    <!-- Фиксированный верхний тулбар -->
    <mat-toolbar class="toolbar-fixed app-toolbar" role="navigation">
      <div class="toolbar-inner container-1200" aria-label="Главная панель">
        <span class="brand-title">ScheduleVision</span>
        <span class="spacer"></span>

        <button
          mat-button
          color="accent"
          type="button"
          (click)="onCtaClick()"
          [disabled]="wm.loading()"
          aria-label="Загрузить файл расписания"
        >
          <mat-icon aria-hidden="true">upload_file</mat-icon>
          <span>{{ 'landing.cta.primary' | transloco }}</span>
        </button>
      </div>
    </mat-toolbar>

    <!-- Отступ под фиксированный тулбар -->
    <div class="wrapper">
      <div class="page-offset"></div>

      <!-- HERO блок (серый фон, центр 1200px) -->
      <section class="hero">
        <div class="container-1200">
          <h1 class="hero-title">{{ 'intro.i1' | transloco }}</h1>
          <p class="hero-lead">{{ 'intro.i2' | transloco }}</p>

          <div class="hero-shot-wrap">
            <img
              class="hero-shot"
              src="/assets/dashboard.png"
              alt="Скриншот дашборда и показателей"
              loading="eager"
              fetchpriority="high"
              [attr.width]="heroImgW()"
              [style.width.px]="heroImgW()"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <!-- Вкладки: Dashboard / Health / P6 Calendar -->
      <section class="tabs-section">
        <div class="container-1200">
          <mat-tab-group fitInkBarToContent
            (selectedIndexChange)="onTabChange($event)">
            <mat-tab label="{{ 'landing.dashboard.title' | transloco }}">
              <div class="tab-inner">
                <div class="feature-split">
                  <div class="feature-split__text">
                    <p class="lead">{{ 'landing.dashboard.lead' | transloco }}</p>
                    <ul class="list">
                      <li>{{ 'landing.dashboard.points.kpis' | transloco }}</li>
                      <li>{{ 'landing.dashboard.points.trend' | transloco }}</li>
                      <li>{{ 'landing.dashboard.points.dates' | transloco }}</li>
                      <li>{{ 'landing.dashboard.points.earnedValue' | transloco }}</li>
                      <li>{{ 'landing.dashboard.points.progress' | transloco }}</li>
                      <li>{{ 'landing.dashboard.points.composition' | transloco }}</li>
                      <li>{{ 'landing.dashboard.points.legendFilters' | transloco }}</li>
                      <li>{{ 'landing.dashboard.points.export' | transloco }}</li>
                    </ul>
                    <p class="lead">{{ 'landing.dashboard.summary' | transloco }}</p>
                  </div>

                  <div class="feature-split__media">
                    <img
                      class="feature-shot"
                      src="/assets/landing/dashboard2.png"
                      alt="Дашборд проекта с ключевыми метриками"
                      loading="lazy"
                      [attr.width]="featImgW()"
                      [style.width.px]="featImgW()"
                      decoding="async"
                    />
                  </div>
                </div>
              </div>
            </mat-tab>

            <mat-tab label="{{ 'landing.health.title' | transloco }}">
              <div class="tab-inner">
                <div class="feature-split">
                  <div class="feature-split__text">
                    <p class="lead">{{ 'landing.health.lead' | transloco }}</p>
                    <ul class="list">
                      <li>{{ 'landing.health.points.overview' | transloco }}</li>
                      <li>{{ 'landing.health.points.diagnostics' | transloco }}</li>
                      <li>{{ 'landing.health.points.transparency' | transloco }}</li>
                      <li>{{ 'landing.health.points.compare' | transloco }}</li>
                      <li>{{ 'landing.health.points.decisions' | transloco }}</li>
                    </ul>
                    <p class="lead">{{ 'landing.health.summary' | transloco }}</p>
                  </div>

                  <div class="feature-split__media">
                    <img
                      class="feature-shot"
                      src="/assets/landing/health2.png"
                      alt="Индикаторы качества графика (DCMA)"
                      loading="lazy"
                      [attr.width]="featImgW()"
                      [style.width.px]="featImgW()"
                      decoding="async"
                    />
                  </div>
                </div>
              </div>
            </mat-tab>

            <mat-tab label="{{ 'landing.p6calendar.title' | transloco }}">
              <div class="tab-inner">
                <div class="feature-split">
                  <div class="feature-split__text">
                    <p class="lead">{{ 'landing.p6calendar.lead' | transloco }}</p>
                    <ul class="list">
                      <li>{{ 'landing.p6calendar.points.exceptions' | transloco }}</li>
                      <li>{{ 'landing.p6calendar.points.worktime' | transloco }}</li>
                    </ul>
                    <p class="lead">{{ 'landing.p6calendar.summary' | transloco }}</p>
                  </div>

                  <div class="feature-split__media">
                    <img
                      class="feature-shot"
                      src="/assets/landing/schedule.png"
                      alt="Просмотр календарей Oracle Primavera P6"
                      loading="lazy"
                      [attr.width]="featImgW()"
                      [style.width.px]="featImgW()"
                      decoding="async"
                    />
                  </div>
                </div>
              </div>
            </mat-tab>
          </mat-tab-group>
        </div>
      </section>

      <section class="about">
        <div class="container-1200 about-grid">
          <figure class="founder-card">
            <div class="avatar-ring">
              <img
                class="avatar-img"
                src="./assets/avatar.jpg"
                alt="Руслан Хиссамов — Основатель"
                width="192"
                height="192"
                loading="lazy"
              />
            </div>
            <figcaption class="founder-meta">
              <div class="founder-name">{{ 'common.rk' | transloco }}</div>
              <div class="founder-role">{{ 'common.founder' | transloco }}</div>
            </figcaption>
          </figure>

          <div class="about-text">
            <section>
              <p class="sv-p">{{ 'intro.p1' | transloco }}</p>
              <p class="sv-p">{{ 'intro.p2' | transloco }}</p>
              <p class="sv-p">{{ 'intro.p3' | transloco }}</p>
              <p class="sv-p">{{ 'intro.p4' | transloco }}</p>
            </section>
          </div>
        </div>
      </section>

      <!-- Футер -->
      <footer class="site-footer">
        <div class="container-1200 footer-inner">
          <div class="footer-left">
            {{ 'info' | transloco }}
          </div>
        </div>
        <div class="container-1200 footer-inner">
          <div class="footer-left">
            {{ 'common.footer.copyright' | transloco:{ year: year } }}
          </div>
          <div class="footer-right">
            <a
              mat-button
              color="primary"
              href="mailto:ruslan.khissamov@meteorhr.com"
              aria-label="{{ 'contact.email_aria' | transloco }}"
            >
              <mat-icon aria-hidden="true">mail</mat-icon>
              <span>{{ 'contact.name' | transloco }}</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  `,
})
export class MainComponent {
  readonly wm = inject(AppStateService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly analytics = inject(AnalyticsService);
  readonly year = new Date().getFullYear();

  // ---------- Responsive images (signals) ----------
  // ширина окна (viewport) как сигнал
  readonly vpWidth = toSignal(
    fromEvent(window, 'resize').pipe(
      startWith(0),
      map(() => window.innerWidth),
      debounceTime(100)
    ),
    { initialValue: typeof window !== 'undefined' ? window.innerWidth : 1200 }
  );

  // размеры твоего центра и паддингов (должны соответствовать SCSS)
  private readonly CONTAINER_MAX = 1200;
  private readonly PAGE_PADDING_X = 16;

  private containerAvailWidth(): number {
    const pad = this.PAGE_PADDING_X * 2;
    return Math.min(this.vpWidth(), this.CONTAINER_MAX) - pad;
  }

  /** HERO image: исходник 800×300 */
  private readonly HERO_MAX_W = 800;
  private readonly HERO_RATIO = 300 / 800;

  readonly heroImgW = computed(() =>
    Math.max(280, Math.min(this.HERO_MAX_W, this.containerAvailWidth()))
  );
  readonly heroImgH = computed(() =>
    Math.round(this.heroImgW() * this.HERO_RATIO)
  );

  /** Feature images (в табах): исходник 700×420 */
  private readonly FEAT_MAX_W = 700;
  private readonly FEAT_RATIO = 420 / 700;

  readonly featImgW = computed(() =>
    Math.max(260, Math.min(this.FEAT_MAX_W, this.containerAvailWidth()))
  );
  readonly featImgH = computed(() =>
    Math.round(this.featImgW() * this.FEAT_RATIO)
  );

  // Автопереход в приложение после загрузки данных
  readonly _redirectWhenReady = effect(() => {
    if (this.wm.isReady()) {
      this.router.navigate(['/app/dashboard']);
    }
  });

  openUploadDialog(): void {
    this.dialog.open(UploadDialogComponent, {
      panelClass: 'sv-upload-dialog-panel',
      autoFocus: false,
      disableClose: false,
      width: '720px',
      maxWidth: '92vw',
    });
  }

  goHome(): void {
    this.router.navigate(['']);
  }

    // 🔹 CTA click (upload)
  onCtaClick(): void {
    this.analytics.event('landing_cta_upload_click');
    this.openUploadDialog();
  }

    private readonly tabSlugs = ['dashboard', 'health', 'p6calendar'] as const;


  // 🔹 Tab change -> analytics
  onTabChange(index: number): void {
    const tab = this.tabSlugs[index] ?? 'unknown';
    this.analytics.event('landing_tab_view', { index, tab });
  }

}