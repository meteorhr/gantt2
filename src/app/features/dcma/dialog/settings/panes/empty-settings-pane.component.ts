import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  standalone: true,
  selector: 'app-dcma-empty-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatDividerModule, TranslocoModule],
  template: `
    <mat-divider></mat-divider>
    <div class="empty-adv">
      <p class="muted">
        {{ 'dcma.settings.empty.text' | transloco }}
      </p>
    </div>
  `,
  styles: [`
    .empty-adv { padding: 12px 0; }
    .muted { opacity: 0.8; }
  `]
})
export class DcmaEmptySettingsPaneComponent {
  @Input() checkId!: number;
}
