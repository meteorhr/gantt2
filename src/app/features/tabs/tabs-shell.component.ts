import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { AppStateService } from '../../state/app-state.service';
import { SidenavService } from '../../service/sidenav.service';

@Component({
  selector: 'sv-tabs-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink, RouterLinkActive, RouterOutlet,
    MatSidenavModule, MatToolbarModule, MatListModule, MatButtonModule, MatIconModule,
    TranslocoModule,
  ],
  styleUrls: ['./sidenav.component.scss'],
  template: `
    @if (wm.isReady()) {
      <mat-sidenav-container class="tabs-sidenav-container" hasBackdrop="true">
        <mat-sidenav
          #sidenav
          class="sidenav-panel"
          mode="over"
          [autoFocus]="false"
          (keydown.escape)="sidenav.close()"
        >
          <mat-action-list style="margin-bottom: 10px;">
            @for (tab of (wm.tabs$ | async); track tab.link) {
              <button
                mat-list-item
                [routerLink]="getLink(tab.link)"
                routerLinkActive="active-link"
                [disabled]="tab.disabled"
                (click)="sidenav.close()"
                [attr.aria-label]="(tab.i18n | transloco)">
                {{ tab.i18n | transloco }}
              </button>
            }
          </mat-action-list>
        </mat-sidenav>

        <mat-sidenav-content>
          <mat-toolbar class="sticky-toolbar">
            <button mat-icon-button (click)="sidenav.toggle()" aria-label="Toggle navigation">
              <mat-icon>menu</mat-icon>
            </button>
            <span class="toolbar-title">{{ (wm.project$ | async)!.name }}</span>
            <span class="spacer"></span>
          </mat-toolbar>

          <div class="content-wrapper">
            <router-outlet></router-outlet>
          </div>
        </mat-sidenav-content>
      </mat-sidenav-container>
    } @else {
      <router-outlet></router-outlet>
    }
  `,
})
export class TabsShellComponent implements OnInit {
  readonly wm = inject(AppStateService);
  private readonly sidenavService = inject(SidenavService);

  @ViewChild('sidenav')
  set sidenav(instance: MatSidenav | undefined) {
    if (instance) {
      this.sidenavService.setSidenav(instance);
    }
  }

  ngOnInit(): void {
    this.wm.initI18n();
  }

  getLink(link: string) {
    return ['/app', link];
  }
}