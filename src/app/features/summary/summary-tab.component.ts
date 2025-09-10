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

        <section class="sv-section sv-upload-highlight " aria-labelledby="xer-upload-title">
            <h4 id="xer-upload-title" class="sv-h4">{{ 'xer.upload.title' | transloco }}</h4>
            <p class="sv-p">{{ 'xer.upload.desc' | transloco }}</p>

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
            aria-label="{{ 'xer.upload.btn_aria' | transloco }}"
            >
            <mat-icon aria-hidden="true">upload_file</mat-icon>
            <span>{{ 'xer.upload.btn' | transloco }}</span>
            </button>

            <button
            mat-stroked-button
            color="primary"
            type="button"
            class="sv-btn"
            [disabled]="wm.loading()"
            (click)="onLoadDemoClick()"
            aria-label="{{ 'xer.upload.demo_btn_aria' | transloco }}"
            >
            <mat-icon aria-hidden="true">dataset</mat-icon>
            <span>{{ 'xer.upload.demo_btn' | transloco }}</span>
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
              aria-label="Email Ruslan Khissamov"
            >
              <mat-icon aria-hidden="true">mail</mat-icon>
              <span>Ruslan Khisamov</span>
            </a>
        </mat-card-actions>
    </mat-card>
    </div>
    } @else {
      <div class="dash-viewport">
        <div class="dash-wrap">

          <mat-card appearance="outlined">
            <mat-card-content>
              <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:12px;">
                <div style="color: rgba(0,0,0,0.6);">
                  {{ 'xer_upload_hint' | transloco }}
                </div>
                <div>
                  <input
                    #reloadInput
                    type="file"
                    accept=".xer,.xml"
                    (change)="onFileSelected($event)"
                    style="display:none" />
                  <button
                    [disabled]="wm.loading()"
                    mat-stroked-button
                    color="primary"
                    type="button"
                    (click)="reloadInput.click()">
                    <mat-icon>upload_file</mat-icon>
                    {{ 'xer_reload_file' | transloco }}
                  </button>
                </div>
              </div>

              @if (wm.loading()) {
                <div class="sv-progress" style="margin-bottom: 8px; margin-top: 8px;">
                  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-content>
              <mat-form-field appearance="outline" style="min-width: 280px;">
                <mat-label>Project</mat-label>
                <mat-select [value]="wm.selectedProjectId()" (selectionChange)="onProjectChange($event.value)">
                  @for (p of wm.projects(); track p.proj_id) {
                    <mat-option [value]="p.proj_id">
                      {{ p.proj_short_name || ('#' + p.proj_id) }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-content>
              <div class="table-wrapper">
                <table mat-table [dataSource]="wm.xerSummaryArray()" class="mat-elevation-z1" style="width:100%; margin-bottom: 16px;">
                  <ng-container matColumnDef="name">
                    <th mat-header-cell *matHeaderCellDef style="width: 200px;">Name</th>
                    <td mat-cell *matCellDef="let row">
                      {{ row.i18n ? (row.i18n | transloco) : row.name }}
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
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

  async onLoadDemoClick(): Promise<void> {
    await this.wm.loadDemo();
  }

  async onProjectChange(projId: number): Promise<void> {
    await this.wm.changeProject(projId);
  }
}
