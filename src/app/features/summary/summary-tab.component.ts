import { Component, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AppStateService } from '../../state/app-state.service';

@Component({
  selector: 'sv-summary-tab',
  standalone: true,
  imports: [
    TranslocoModule, MatCardModule, MatProgressBarModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatSelectModule, MatTableModule,
  ],
  styleUrls: ['../../app.scss'],
  template: `
    @if (!wm.isReady()) {
      <div class="sv-root">
        <mat-card class="sv-card" appearance="outlined">
          <mat-card-header class="sv-header">
            <mat-card-title class="sv-title">{{ 'app.title' | transloco }}</mat-card-title>
            <mat-card-subtitle class="sv-subtitle">{{ 'app.subtitle' | transloco }}</mat-card-subtitle>
          </mat-card-header>

          <mat-card-content class="sv-content">
            <section class="sv-section sv-intro">
              <p class="sv-p">{{ 'intro.p1' | transloco }}</p>
              <p class="sv-p">{{ 'intro.p2' | transloco }}</p>
              <p class="sv-p">{{ 'intro.p3' | transloco }}</p>
              <p class="sv-p">{{ 'intro.p4' | transloco }}</p>
            </section>

            <section class="sv-section sv-upload-highlight" aria-labelledby="base-upload-title">
              <h4 id="base-upload-title" class="sv-h4">{{ 'base.upload.title' | transloco }}</h4>
              <p class="sv-p">{{ 'base.upload.desc' | transloco }}</p>

              <input
                #fileInput
                type="file"
                accept=".xer,.xml"
                (change)="onFileSelected($event)"
                hidden
                aria-hidden="true"
              />

              <button
                mat-stroked-button
                type="button"
                class="sv-btn"
                [disabled]="wm.loading()"
                (click)="fileInput.click()"
                aria-label="{{ 'base.upload.btn_aria' | transloco }}"
              >
                <mat-icon aria-hidden="true">upload_file</mat-icon>
                <span>{{ 'base.upload.btn' | transloco }}</span>
              </button>

              <button
                mat-stroked-button
                color="primary"
                type="button"
                class="sv-btn"
                [disabled]="wm.loading()"
                (click)="onLoadDemoClick()"
                aria-label="{{ 'base.upload.demo_btn_aria' | transloco }}"
              >
                <mat-icon aria-hidden="true">dataset</mat-icon>
                <span>{{ 'base.upload.demo_btn' | transloco }}</span>
              </button>

              @if (wm.loading()) {
                <div class="sv-progress">
                  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                </div>
              }

              @if (wm.error()) {
                <div class="sv-error mat-body">{{ wm.error() }}</div>
              }
            </section>

            <section class="sv-section sv-security" aria-labelledby="security-title">
              <h4 id="security-title" class="sv-h4">{{ 'security.title' | transloco }}</h4>
              <p class="sv-p">{{ 'security.lead' | transloco }}</p>
              <ul class="sv-ul">
                <li class="sv-li">{{ 'security.items.local_only' | transloco }}</li>
                <li class="sv-li">{{ 'security.items.indexeddb' | transloco }}</li>
                <li class="sv-li">{{ 'security.items.analytics' | transloco }}</li>
                <li class="sv-li">{{ 'security.items.control' | transloco }}</li>
              </ul>
              <p class="sv-p">{{ 'security.outro' | transloco }}</p>
            </section>

            <section class="sv-section sv-privacy" aria-labelledby="privacy-title">
              {{ 'info' | transloco }}
            </section>
          </mat-card-content>

          <mat-card-actions>
            <a
              mat-stroked-button
              color="primary"
              href="mailto:ruslan.khissamov@meteorhr.com"
              aria-label="{{ 'contact.email_aria' | transloco }}"
            >
              <mat-icon aria-hidden="true">mail</mat-icon>
              <span>{{ 'contact.name' | transloco }}</span>
            </a>
          </mat-card-actions>
        </mat-card>
      </div>
    } @else {
      <div class="dash-viewport">
        <div class="dash-wrap">

          <!-- Блок: базовый проект + замена файла -->
          <mat-card appearance="outlined">
            <mat-card-content>
              <div class="xr-row">
                <!-- Левая колонка: выбор проекта -->
                <div class="xr-left">
                  <mat-form-field appearance="outline" class="project-field">
                    <mat-label>{{ 'project.label' | transloco }}</mat-label>
                    <mat-select
                      [disabled]="wm.loading()"
                      [value]="wm.selectedProjectId()"
                      (selectionChange)="onProjectChange($event.value)"
                    >
                      @for (p of wm.projects(); track p.proj_id) {
                        <mat-option [value]="p.proj_id">
                          {{ p.proj_short_name || ('#' + p.proj_id) }}
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </div>

                <!-- Правая колонка: кнопка сверху, подсказка снизу -->
                <div class="xr-right">
                  <div class="xr-upload">
                    <input
                      #reloadInput
                      type="file"
                      accept=".xer,.xml"
                      (change)="onFileSelected($event)"
                      style="display:none"
                    />
                    <button
                      [disabled]="wm.loading()"
                      mat-stroked-button
                      color="primary"
                      type="button"
                      (click)="reloadInput.click()"
                      aria-label="{{ 'base.reload.btn_aria' | transloco }}"
                      aria-describedby="uploadHint"
                    >
                      <mat-icon>upload_file</mat-icon>
                      {{ 'base.reload.btn' | transloco }}
                    </button>
                  </div>

                  <div id="uploadHint" class="xr-hint">
                    {{ 'base.upload.hint' | transloco }}
                  </div>
                </div>
              </div>

              @if (wm.loading()) {
                <div class="sv-progress">
                  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Блок: кандидат (селект скрыт, если массив пуст) -->
          <mat-card appearance="outlined" style="margin-top:12px;">
            <mat-card-content>
              <div class="xr-row">
                <div class="xr-left">
                  @let candidateList = wm.projectsCandidate();
                  @let candidateHasProjects = (candidateList?.length ?? 0) > 0;

                  @if (candidateHasProjects) {
                    <mat-form-field appearance="outline" class="project-field">
                      <mat-label>{{ 'project.candidate_label' | transloco }}</mat-label>
                      <mat-select
                        [disabled]="wm.loadingCandidate()"
                        [value]="wm.selectedProjectIdCandidate()"
                      >
                        @for (p of candidateList; track p.proj_id) {
                          <mat-option [value]="p.proj_id">
                            {{ p.proj_short_name || ('#' + p.proj_id) }}
                          </mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  }
                </div>

                <div class="xr-right">
                  <div class="xr-upload">
                    <input
                      #candidateInput
                      type="file"
                      accept=".xer,.xml"
                      (change)="onCandidateFileSelected($event)"
                      style="display:none"
                    />
                    <button
                      [disabled]="wm.loadingCandidate()"
                      mat-stroked-button
                      color="primary"
                      type="button"
                      (click)="candidateInput.click()"
                      aria-describedby="candidateUploadHint"
                      aria-label="{{ (candidateHasProjects ? 'candidate.upload.btn_reload_aria' : 'candidate.upload.btn_add_aria') | transloco }}"
                    >
                      <mat-icon>upload_file</mat-icon>
                      @if (candidateHasProjects) {
                        {{ 'candidate.upload.btn_reload' | transloco }}
                      } @else {
                        {{ 'candidate.upload.btn_add' | transloco }}
                      }
                    </button>
                  </div>

                  <div id="candidateUploadHint" class="xr-hint">
                    {{ 'base.upload.hint' | transloco }}
                  </div>
                </div>
              </div>

              @if (wm.loadingCandidate()) {
                <div class="sv-progress">
                  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Таблица суммарной информации -->
          <mat-card appearance="outlined">
            <mat-card-content>
              <div class="table-wrapper">
                <table mat-table [dataSource]="wm.xerSummaryArray()" class="mat-elevation-z1" style="width:100%; margin-bottom: 16px;">
                  <ng-container matColumnDef="name">
                    <th mat-header-cell *matHeaderCellDef style="width: 200px;">{{ 'table.name' | transloco }}</th>
                    <td mat-cell *matCellDef="let row">
                      {{ row.i18n ? (row.i18n | transloco) : row.name }}
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>{{ 'table.value' | transloco }}</th>
                    <td mat-cell *matCellDef="let row">
                      {{ row.i18nValue ? (row.i18nValue | transloco: row.params) : row.value }}
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="['name', 'value']; sticky: true"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['name', 'value'];"></tr>
                </table>
              </div>
            </mat-card-content>
          </mat-card>

        </div>
      </div>
    }
  `,
})
export class SummaryTabComponent {
  readonly wm = inject(AppStateService);

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input?.files && input.files.length ? input.files[0] : null;
    if (file) await this.wm.loadFromFile(file);
    if (input) input.value = '';
  }

  async onCandidateFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input?.files && input.files.length ? input.files[0] : null;
    if (file) {
      try {
        await this.wm.loadFromFile(file, { candidate: true });
      } finally {
        if (input) input.value = '';
      }
    }
  }

  async onLoadDemoClick(): Promise<void> {
    await this.wm.loadDemo();
  }

  async onProjectChange(projId: number): Promise<void> {
    await this.wm.changeProject(projId);
  }
}