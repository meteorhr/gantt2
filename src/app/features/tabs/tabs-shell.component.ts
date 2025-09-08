import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { TranslocoModule } from '@jsverse/transloco';
import { AppStateService } from '../../state/app-state.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sv-tabs-shell',
  standalone: true,
  imports: [
    RouterLink, RouterLinkActive, RouterOutlet,
    MatTabsModule, MatIconModule, MatButtonModule, MatCardModule, MatProgressBarModule,
    MatFormFieldModule, MatSelectModule, MatListModule, MatTableModule, CommonModule,
    TranslocoModule,
  ],

  template: `
    
    @if (wm.isReady()) {
        <div style="padding: 16px 16px 0px 16px; height">
            <h3 >{{ (wm.project$ | async)!.name }}</h3>

            <nav mat-tab-nav-bar style="margin-bottom: 10px" [tabPanel]="tabPanel" mat-stretch-tabs="false" mat-align-tabs="start">
            @for (tab of (wm.tabs$ | async); track tab.link) {
                <a mat-tab-link
                    [routerLink]="getLink(tab.link)"
                    [active]="rla.isActive"
                    [disabled]="tab.disabled"
                    routerLinkActive
                    #rla="routerLinkActive">
                    {{ tab.i18n | transloco }}
                </a>
            }
            </nav>

            <mat-tab-nav-panel #tabPanel>
                <router-outlet></router-outlet>
            </mat-tab-nav-panel>
        </div>
   } @else {
    <router-outlet></router-outlet>
   }
  `,
})
export class TabsShellComponent implements OnInit {
  readonly wm = inject(AppStateService);
  

  ngOnInit(): void {
    this.wm.initI18n();
  }

  getLink(link: string) {
    return ['/', link];
  }
}
