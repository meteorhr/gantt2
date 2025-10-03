import {
    Directive, ElementRef, Input, OnDestroy, AfterViewInit, signal, computed
  } from '@angular/core';
  
  @Directive({
    standalone: true,
    selector: '[animatedSummaryBorder]',
    exportAs: 'asb'
  })
  export class AnimatedSummaryBorderDirective implements AfterViewInit, OnDestroy {
    @Input() strokePx = 2;
    @Input() radiusPx = 12;
  
    private ro?: ResizeObserver;
    private host: HTMLElement;
  
    sumW = signal(0);
    sumH = signal(0);
  
    constructor(el: ElementRef<HTMLElement>) {
      this.host = el.nativeElement;
    }
  
    ngAfterViewInit(): void {
      this.measure();
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this.host);
    }
  
    ngOnDestroy(): void {
      this.ro?.disconnect();
    }
  
    private measure(): void {
      const rect = this.host.getBoundingClientRect();
      const cs = getComputedStyle(this.host);
      const bl = parseFloat(cs.borderLeftWidth)  || 0;
      const br = parseFloat(cs.borderRightWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth)   || 0;
      const bb = parseFloat(cs.borderBottomWidth)|| 0;
  
      const w = Math.max(1, Math.round(rect.width  - bl - br));
      const h = Math.max(1, Math.round(rect.height - bt - bb));
  
      this.sumW.set(w);
      this.sumH.set(h);
    }
  
    summaryBorderPath(): string {
      const w = this.sumW(), h = this.sumH();
      if (!w || !h) return '';
  
      const s = this.strokePx / 2;
      const r = Math.min(this.radiusPx, (w / 2) - s, (h / 2) - s);
  
      const x1 = s,       y1 = s;
      const x2 = w - s,   y2 = h - s;
  
      const topL = x1 + r, topR = x2 - r;
      const botL = x1 + r, botR = x2 - r;
      const midX = (x1 + x2) / 2;
  
      return [
        `M ${midX} ${y1}`,
        `H ${topR}`,
        `A ${r} ${r} 0 0 1 ${x2} ${y1 + r}`,
        `V ${y2 - r}`,
        `A ${r} ${r} 0 0 1 ${botR} ${y2}`,
        `H ${botL}`,
        `A ${r} ${r} 0 0 1 ${x1} ${y2 - r}`,
        `V ${y1 + r}`,
        `A ${r} ${r} 0 0 1 ${topL} ${y1}`,
        `H ${midX}`
      ].join(' ');
    }
  }
  