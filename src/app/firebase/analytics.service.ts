// analytics.service.ts
import { Injectable, inject } from '@angular/core';
import { Analytics } from '@angular/fire/analytics';
import { logEvent } from 'firebase/analytics';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly analytics = inject(Analytics, { optional: true });

  event(name: string, params?: Record<string, unknown>) {
    if (!this.analytics) return; // SSR/без Analytics — no-op
    logEvent(this.analytics, name, params ?? {});
  }
}