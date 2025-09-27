// sidebar.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Модель (Model) в терминах MWWM, 
 * хранит состояние "открыт ли сайдбар" и методы для управления им.
 * Предоставляет Observable 'isOpen$' для реактивной подписки на состояние.
 */
@Injectable({ providedIn: 'root' })
export class SidenavService implements OnDestroy {
    private sidenav: MatSidenav | undefined;
    private readonly destroy$ = new Subject<void>();

    // 1. Создаем приватный Subject для хранения состояния
    private readonly _isOpen = new BehaviorSubject<boolean>(false);
    
    // 2. Публичный Observable, чтобы другие части приложения могли только читать состояние
    public readonly isOpen$ = this._isOpen.asObservable();

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * Регистрирует экземпляр MatSidenav в сервисе и подписывается на его изменения состояния.
     * @param sidenav Экземпляр компонента MatSidenav
     */
    public setSidenav(sidenav: MatSidenav): void {
        this.sidenav = sidenav;

        // 3. Подписываемся на событие изменения состояния и обновляем наш Subject
        this.sidenav.openedChange
            .pipe(takeUntil(this.destroy$)) // Автоматически отписываемся при уничтожении сервиса
            .subscribe(isOpen => this._isOpen.next(isOpen));
    }

    /**
     * Безопасно открывает сайднав.
     * @returns Promise<MatDrawerToggleResult>
     */
    public open(): Promise<any> | void {
        // 4. Добавляем защиту от вызова на неопределенном sidenav
        return this.sidenav?.open();
    }

    /**
     * Безопасно закрывает сайднав.
     * @returns Promise<MatDrawerToggleResult>
     */
    public close(): Promise<any> | void {
        // 4. Добавляем защиту
        return this.sidenav?.close();
    }

    /**
     * Безопасно переключает состояние сайднава.
     */
    public toggle(): void {
        this.sidenav?.toggle();
    }
}