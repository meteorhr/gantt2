import {
  Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy, OnChanges, SimpleChanges, NgZone, ChangeDetectorRef
} from '@angular/core';
import * as d3 from 'd3';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

type Item = { value: string; count: number };



@Component({
  selector: 'doughunt',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './doughunt.component.html',
  styleUrls: ['./doughunt.component.scss']
})
export class DoughuntComponent implements AfterViewInit, OnDestroy, OnChanges {
  hoveredValue: string | null = null;
  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLDivElement>;
  @ViewChild('tooltip', { static: true }) private tipRef!: ElementRef<HTMLDivElement>;
  tooltipVisible = false;

  /** Можно передать строкой без []: "TK_NotStart 594\nTK_Complete 112\n..." или массивом {key,value}[] */
  @Input() set data(v: string | Item[] | null | undefined) {
    this._rawData = v ?? null;
    this.items = this.parseInput(v);
    this.resetActiveFromItems();
    this.scheduleRender();
  }

  /** Размер диаграммы (квадрат) */
  @Input() size = 260;

  @Input() colors: Record<string, string> = {};
  @Input() translocoPrefix: string = '';

  private _rawData: string | Item[] | null = null;
  items: Item[] = [];
  activeKeys = new Set<string>();
  private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gChart?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private gCenter?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private arcGen?: d3.Arc<any, d3.PieArcDatum<Item>>;
  private pieGen?: d3.Pie<any, Item>;
  private resizeObserver?: ResizeObserver;
  private needsRender = false;

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private transloco: TranslocoService,
  ) {}

  ngAfterViewInit(): void {
    this.createBase();
    // проверим, что есть tooltip
    if (!this.tipRef) {
      console.warn('[doughunt] tooltip element not found');
    }
    this.renderAll();
    this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
    this.resizeObserver.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['size'] && !changes['size'].firstChange) {
      this.scheduleRender();
    }
  }

  // ---------- Parsing ----------
  private parseInput(v: string | Item[] | null | undefined): Item[] {
    if (!v) return [];
    if (Array.isArray(v)) {
      return v
        .filter(x => x && typeof x.value === 'string' && Number.isFinite(Number(x.count)))
        .map(x => ({ value: String(x.value), count: Number(x.count) }))
        .filter(x => x.value !== 'Total' && x.count > 0);
    }
    // строка: строки вида "Key value"
    const lines = String(v).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out: Item[] = [];
    for (const line of lines) {
      const m = line.match(/^([A-Za-z0-9_]+)\s+(-?\d+(?:\.\d+)?)$/);
      if (!m) continue;
      const key = m[1];
      const value = Number(m[2]);
      if (key === 'Total') continue;
      if (!Number.isFinite(value)) continue;
      out.push({ value: key, count: value });
    }
    return out;
  }

  private resetActiveFromItems(): void {
    this.activeKeys = new Set(this.items.map(it => it.value));
  }

  // ---------- D3 base ----------
  private createBase(): void {
    d3.select(this.host.nativeElement).select('svg').remove();
    const bbox = this.host.nativeElement.getBoundingClientRect();
    const s = Math.max(180, this.size || Math.min(bbox.width, 340));
    const svg = d3.select(this.host.nativeElement)
      .append('svg')
      .attr('width', s)
      .attr('height', s);
    this.svg = svg;

    const g = svg.append('g').attr('transform', `translate(${s / 2}, ${s / 2})`);
    this.gChart = g.append('g').attr('class', 'chart');
    this.gCenter = g.append('g').attr('class', 'center');

    // Скрывать tooltip/hover при уходе курсора с графика
    this.svg.on('mouseleave', () => {
      this.hoveredValue = null;
      this.updateHoverState();
      this.hideTooltip();
    });

    const outerR = s * 0.48;
    const innerR = s * 0.32;

    this.arcGen = d3.arc<any, d3.PieArcDatum<Item>>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .cornerRadius(4)
      .padAngle(0.012);

    this.pieGen = d3.pie<Item>()
      .sort(null)
      .value((d) => d.count);
  }

  private scheduleRender(): void {
    if (!this.svg) return;
    if (this.needsRender) return;
    this.needsRender = true;
    queueMicrotask(() => {
      this.needsRender = false;
      this.renderAll();
    });
  }

  private filteredItems(): Item[] {
    return this.items.filter(it => this.activeKeys.has(it.value));
  }

  private totalValue(): number {
    return this.filteredItems().reduce((s, it) => s + it.count, 0);
  }

  // ---------- Render ----------
  private renderAll(): void {
    if (!this.svg || !this.pieGen || !this.arcGen) return;

    const data = this.filteredItems();
    const pieData = this.pieGen(data);

    // arcs
    const arcs = this.gChart!
      .selectAll<SVGPathElement, d3.PieArcDatum<Item>>('path.slice')
      .data(pieData, (d: any) => d.data.value);

    {
      const self = this;
      arcs.exit()
        .transition().duration(250)
        .attrTween('d', function(this: SVGPathElement, d: any) {
          const interp = d3.interpolate((this as any)._current || d, d);
          (this as any)._current = d;
          return (t: number) => self.arcGen!(interp(1 - t))!;
        } as any)
        .style('opacity', 0)
        .remove();
    }

    const arcsEnter = arcs.enter()
      .append('path')
      .attr('class', 'slice')
      .attr('fill', d => this.colors[d.data.value] ?? '#90a4ae')
      .attr('d', d => this.arcGen!(d)!)
      .each(function (d) { (this as any)._current = d; })
      .on('mouseenter', (event: MouseEvent, d) => { this.hoveredValue = d.data.value; this.updateHoverState(); this.showTooltip(d, event); })
      .on('mousemove',  (event: MouseEvent, d) => { this.moveTooltip(event); })
      .on('mouseleave', () => { this.hoveredValue = null; this.updateHoverState(); this.hideTooltip(); });

    arcsEnter.append('title').text(d => `${this.transloco.translate(this.translocoPrefix + d.data.value)}: ${d.data.count}`);

    {
      const self = this;
      const merged = arcsEnter.merge(arcs as any)
        .on('mouseenter', (event: MouseEvent, d: any) => { this.hoveredValue = d.data.value; this.updateHoverState(); this.showTooltip(d, event); })
        .on('mousemove',  (event: MouseEvent) => { this.moveTooltip(event); })
        .on('mouseleave', () => { this.hoveredValue = null; this.updateHoverState(); this.hideTooltip(); });
      merged
        .transition().duration(350)
        .attrTween('d', function(this: SVGPathElement, d: any) {
          const interp = d3.interpolate((this as any)._current || d, d);
          (this as any)._current = d;
          return (t: number) => self.arcGen!(interp(t))!;
        } as any);
    }

    // center text
    const s = Number(this.svg.attr('width'));
    const total = this.totalValue();
    this.gCenter!.selectAll('*').remove();
    this.gCenter!
      .append('text')
      .attr('class', 'total-value')
      .attr('text-anchor', 'middle')
      .attr('y', -4)
      .text(this.formatNumber(total));

    this.gCenter!
      .append('text')
      .attr('class', 'total-label')
      .attr('text-anchor', 'middle')
      .attr('y', 18)
      .text('Total');

    this.updateHoverState();
    // если при перерисовке курсор оставался над сектором — положение тултипа обновится на ближайшее событие mousemove
  }

  private arcTween(newData: d3.PieArcDatum<Item>, reverse = false) {
    const that = this;
    return function(this: SVGPathElement, t: number): string {
      const interp = d3.interpolate((this as any)._current || newData, newData);
      (this as any)._current = newData;
      return that.arcGen!(interp(reverse ? 1 - t : t))!;
    };
  }

  // ---------- Legend interaction ----------
  onLegendToggle(value: string): void {
    if (this.activeKeys.has(value)) {
      this.activeKeys.delete(value);
    } else {
      this.activeKeys.add(value);
    }
    this.renderAll();
  }

  isActive(value: string): boolean {
    return this.activeKeys.has(value);
  }

  colorFor(value: string): string {
    return this.colors[value] ?? '#90a4ae';
  }

  // ---------- Utils ----------
  private formatNumber(v: number): string {
    if (v >= 1000) {
      const s = (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1);
      return `${s}k`;
    }
    return String(v);
  }

  private t(key: string): string {
    try { return this.transloco.translate(this.translocoPrefix + key); } catch { return key; }
  }

  setHovered(val: string | null): void {
    this.hoveredValue = val;
    this.updateHoverState();
  }

  private updateHoverState(): void {
    if (!this.gChart) return;
    const hv = this.hoveredValue;
    this.gChart
      .selectAll<SVGPathElement, d3.PieArcDatum<Item>>('path.slice')
      .attr('opacity', d => hv && d.data.value !== hv ? 0.35 : 1);
  }

  // ---------- Tooltip helpers ----------
  private showTooltip(d: d3.PieArcDatum<Item>, evt: MouseEvent): void {
    if (!this.tipRef) return;
    const el = this.tipRef.nativeElement;
    const total = this.totalValue() || 1;
    const pct = (d.data.count / total) * 100;
    el.innerHTML = `${this.t(d.data.value)}: <b>${d.data.count}</b> (${pct.toFixed(1)}%)`;
    this.zone.run(() => {
      this.tooltipVisible = true;
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    });
    this.moveTooltip(evt);
    // страховка: сразу сделать видимым даже вне зоны
    el.style.opacity = '1';
  }

  private moveTooltip(evt: MouseEvent): void {
    if (!this.tipRef) return;
    const el = this.tipRef.nativeElement;
    // Фиксированное позиционирование к окну (совместимо с .tooltip { position: fixed; })
    el.style.left = `${evt.clientX}px`;
    el.style.top  = `${evt.clientY}px`;
  }

  private hideTooltip(): void {
    this.zone.run(() => {
      this.tooltipVisible = false;
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    });
    if (this.tipRef) {
      const el = this.tipRef.nativeElement;
      // убираем инлайн-стили, чтобы сработал CSS .tooltip { opacity: 0; }
      el.style.opacity = '';
    }
  }
}