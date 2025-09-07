// src/app/firebase/analytics.service.ts
import { Injectable, inject } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly analytics = inject(Analytics);

  event(name: string, params?: Record<string, any>): void {
    try {
      logEvent(this.analytics, name as any, params);
    } catch (e) {
      // Analytics может быть недоступен (например, инкогнито/блокировщик)
      console.warn('[Analytics] logEvent error:', e);
    }
  }
}