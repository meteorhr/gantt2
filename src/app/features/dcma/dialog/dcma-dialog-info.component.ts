import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { TranslocoModule } from "@jsverse/transloco";

@Component({
  standalone: true,
  selector: 'app-dcma-info-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>
      {{ 'dcma.info.check.' + data.check + '.title' | transloco }}
    </h2>
    <div mat-dialog-content class="info-body">
        <div class="body">
            <p class="title_info">
                {{ ('dcma.info.check.goal') | transloco }}:
            </p>
            <p>
                {{ ('dcma.info.check.' + data.check + '.goal') | transloco }}
            </p>
        </div>
        <div class="body">
            <p class="title_info">
                {{ ('dcma.info.check.check') | transloco }}:
            </p>
            <p>
                {{ ('dcma.info.check.' + data.check + '.check') | transloco }}
            </p>
        </div>
        <div class="body">
            <p class="title_info">
                {{ ('dcma.info.check.importanceMetrics') | transloco }}:
            </p>
            <p>
                {{ ('dcma.info.check.' + data.check + '.importanceMetrics') | transloco }}
            </p>
        </div>
        <div class="body">
            <p class="title_info">
                {{ ('dcma.info.check.frequency') | transloco }}:
            </p>
            <p>
                {{ ('dcma.info.check.' + data.check + '.frequency') | transloco }}
            </p>
        </div>
        <div class="body">
            <p class="title_info">
                {{ ('dcma.info.check.description') | transloco }}:
            </p>
            <div [innerHTML]="'dcma.info.check.'+data.check+'.description' | transloco"></div>

        </div>






    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>
        {{ 'common.close' | transloco }}
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .info-body {
      white-space: pre-wrap;
      line-height: 1.5;
      max-height: 65vh;
      overflow: auto;
      padding-right: 8px; /* для не перекрывающегося скроллбара */
    }

    .info-body p { margin: 0 }

    .body { margin-bottom: 12px; }

    .title_info {
      position: relative;
      font-weight: 600;
      margin: 12px 0 4px 0;
      color: var(--mat-sys-primary, #1976d2);
      letter-spacing: .02em;

    }
    /* Разделитель с экшенами диалога */
    :host ::ng-deep .mat-mdc-dialog-actions {
      padding-top: 8px;
      border-top: 1px solid rgba(0,0,0,.06);
    }

    /* Чуть компактнее на узких экранах */
    @media (max-width: 600px) {
      .info-body { max-height: 55vh; }
      h2[mat-dialog-title] { font-size: 1.05rem; }
    }
  `]
})
export class DcmaInfoDialogComponent {
  constructor(public ref: MatDialogRef<DcmaInfoDialogComponent>, @Inject(MAT_DIALOG_DATA) public data: { check: number }) {}
}