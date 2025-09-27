import { Component, effect, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { AppStateService } from '../../state/app-state.service';

@Component({
  selector: 'sv-main',
  standalone: true,
  imports: [
    TranslocoModule, MatCardModule, MatProgressBarModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatSelectModule, MatTableModule,
  ],
  styleUrls: ['../../app.scss'],
  template: `
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
  `,
})
export class MainComponent {
  readonly wm = inject(AppStateService);
  private readonly router = inject(Router);

  // Автопереход на /summary, когда данные готовы
  readonly _redirectWhenReady = effect(() => {
    if (this.wm.isReady()) {
      this.router.navigate(['/app/summary']);
    }
  });

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input?.files && input.files.length ? input.files[0] : null;
    if (file) await this.wm.loadFromFile(file);
    if (input) input.value = '';
  }

  async onLoadDemoClick(): Promise<void> {
    await this.wm.loadDemo();
  }
}