import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { TranslocoModule } from '@jsverse/transloco';
import { AppStateService } from '../../state/app-state.service';

@Component({
  selector: 'sv-upload-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
    styleUrls: ['./upload-dialog.component.scss'],
  template: `
    <h2 mat-dialog-title>{{ 'base.upload.title' | transloco }}</h2>

    <div mat-dialog-content class="dialog-content">
      <p class="dialog-lead">
        {{ 'base.upload.desc' | transloco }}
      </p>

      <div class="upload-actions">
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
          class="upload-btn"
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
          class="upload-btn"
          [disabled]="wm.loading()"
          (click)="onLoadDemoClick()"
          aria-label="{{ 'base.upload.demo_btn_aria' | transloco }}"
        >
              <mat-icon aria-hidden="true">dataset</mat-icon>
              <span>{{ 'base.upload.demo_btn' | transloco }}</span>
        </button>
      </div>

      @if (wm.loading()) {
        <div class="dialog-progress">
          <mat-progress-bar mode="indeterminate" aria-label="Loading"></mat-progress-bar>
        </div>
      }

      @if (wm.error()) {
        <div class="dialog-error">{{ wm.error() }}</div>
      }

          <section class="sv-section sv-security" aria-labelledby="security-title">
           
            <p class="sv-p">{{ 'security.lead' | transloco }}</p>
            <ul class="sv-ul">
              <li class="sv-li">{{ 'security.items.local_only' | transloco }}</li>
              <li class="sv-li">{{ 'security.items.indexeddb' | transloco }}</li>
              <li class="sv-li">{{ 'security.items.analytics' | transloco }}</li>
              <li class="sv-li">{{ 'security.items.control' | transloco }}</li>
            </ul>
            <p class="sv-p">{{ 'security.outro' | transloco }}</p>
          </section>
    </div>

  `,
})
export class UploadDialogComponent {
  readonly wm = inject(AppStateService);
  private readonly ref = inject(MatDialogRef<UploadDialogComponent>);

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input?.files && input.files.length ? input.files[0] : null;
    try {
      if (file) {
        await this.wm.loadFromFile(file);
        this.ref.close();
      }
    } finally {
      if (input) input.value = '';
    }
  }

  async onLoadDemoClick(): Promise<void> {
    await this.wm.loadDemo();
    this.ref.close();
  }
}