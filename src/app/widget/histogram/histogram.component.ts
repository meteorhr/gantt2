import {
    Component, Input, ElementRef, ViewChild,
    AfterViewInit, OnChanges, SimpleChanges, OnDestroy, Injectable 
  } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { TranslocoService } from '@jsverse/transloco';
  import * as d3 from 'd3';
  
  // ====== Совместимые типы входа ======
  
  // (A) Готовые точки для рендера
  export interface ChartPoint {
    label: string;                 // подпись на оси X (period: YYYY-MM или YYYY-MM-DD)
    planned: number;               // план (бар)
    actual: number;                // факт (бар)
    remaining: number;             // остаток (бар)
    plannedCumulative: number;     // накопительный план (линия)
    actualCumulative: number;      // накопительный факт (линия)
    remainingCumulative: number;   // накопительный остаток (линия)
  }
  
  // (B) «Новая» форма HistogramResult (предпочтительно)
  export interface NewHistogramPoint {
    period: string;
    planned_qty: number;
    actual_qty: number;
    remaining_qty: number;
    planned_cost: number;
    actual_cost: number;
    remaining_cost: number;
  }
  export interface HistogramSeriesNew {
    rsrc_id: number | null;
    points: NewHistogramPoint[];
  }
  export interface HistogramResultNew {
    periods: string[];             // упорядоченный список периодов
    data: HistogramSeriesNew[];    // [0] — overall, далее по ресурсам
  }
  
  // (C) «Старая» форма HistogramResult (совместимость)
  export interface HistogramPointLegacy {
    period: string;
    rsrc_id: number | null;
    planned_qty: number;
    actual_qty: number;
    remaining_qty: number;
    planned_cost: number;
    actual_cost: number;
    remaining_cost: number;
  }
  export interface HistogramResultLegacy {
    overall: HistogramPointLegacy[];                  // общая серия
    byResource: Record<number, HistogramPointLegacy[]>; // rsrc_id -> точки
  }
  
  // Объединённый тип для входного @Input() data
  export type AnyHistogramResult = HistogramResultNew | HistogramResultLegacy;
  
  export type MetricMode = 'qty' | 'cost';
  
  // ====== D3 сервис ======
  
  /** Отступы для SVG */
  const margin = { top: 40, right: 60, bottom: 90, left: 60 } as const;
  
  /** Цвета серий */
  const colors = {
    planned: 'rgb(3, 180, 180)',
    actual: 'rgb(47, 64, 116)',
    remaining: 'rgb(13, 114, 222)',
    plannedCumulative: 'rgb(3, 180, 180)',
    actualCumulative: 'rgb(47, 64, 116)',
    remainingCumulative: 'rgb(13, 114, 222)',
    baseline: '#17becf',
  } as const;
  
  /** Ключи легенды + локализация */
  const legendItems = [
    { key: 'planned',              labelKey: 'hist.series.planned',              color: colors.planned },
    { key: 'actual',               labelKey: 'hist.series.actual',               color: colors.actual },
    { key: 'remaining',            labelKey: 'hist.series.remaining',            color: colors.remaining },
    { key: 'plannedCumulative',    labelKey: 'hist.series.plannedCumulative',    color: colors.plannedCumulative },
    { key: 'actualCumulative',     labelKey: 'hist.series.actualCumulative',     color: colors.actualCumulative },
    { key: 'remainingCumulative',  labelKey: 'hist.series.remainingCumulative',  color: colors.remainingCumulative },
    { key: 'baseline',             labelKey: 'hist.series.baseline',             color: colors.baseline },
  ] as const;
  
  @Injectable()
  export class HistogramChartD3Service {
    private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private g!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private tooltip!: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    private width = 0;
    private height = 0;
  
    /** видимость серий */
    private vis: Record<string, boolean> = {
      planned: true,
      actual: true,
      remaining: true,
      plannedCumulative: true,
      actualCumulative: true,
      remainingCumulative: true,
      baseline: false, // по умолчанию скрыта
    };
  
    constructor(private i18n: TranslocoService) {}
  
    /** Инициализация: передай ссылки на svg и внешнюю div-подсказку */
    init(svgEl: SVGSVGElement, tooltipEl: HTMLDivElement) {
      this.svg = d3.select(svgEl);
      this.tooltip = d3.select(tooltipEl);
  
      // контейнер
      this.svg.append('g')
        .attr('class', 'hist-container')
        .attr('transform', `translate(${margin.left},${margin.top})`);
      this.g = this.svg.select<SVGGElement>('g.hist-container')!;
    }
  
    /** Установка размеров */
    setSize(totalWidth: number, totalHeight = 360) {
      this.width  = Math.max(0, totalWidth  - margin.left - margin.right);
      this.height = Math.max(0, totalHeight - margin.top  - margin.bottom);
      this.svg.attr('width', totalWidth).attr('height', totalHeight);
    }
  
    /** Полная очистка области рисования */
    clear() { if (this.g) this.g.selectAll('*').remove(); }
  
    /** Публичный рендер для уже готового массива точек */
    drawArray(points: ChartPoint[], baselineValue?: number) {
      this.drawInternal(points, baselineValue);
    }
  
    /**
     * Рендер из HistogramResult (поддерживаются новая и старая формы)
     * @param result HistogramResultNew | HistogramResultLegacy
     * @param seriesIndex 0 — overall; >0 — по ресурсу (в «старой» форме — сортировка rsrc_id по возрастанию)
     * @param mode 'qty' | 'cost'
     */
    drawFromHistogram(result: AnyHistogramResult, seriesIndex = 0, mode: MetricMode = 'qty', baselineValue?: number) {
      // Новая форма?
      if (this.isNewResult(result)) {
        const series = result.data?.[seriesIndex];
        if (!series) { this.clear(); return; }
        const pts = this.adaptNewSeries(series, mode, result.periods);
        this.drawInternal(pts, baselineValue);
        return;
      }
      // Старая форма (совместимость)
      if (!this.isLegacyResult(result)) { this.clear(); return; }
  
      const periodsSorted = this.uniqueSortedPeriods([
        ...result.overall.map(x => x.period),
        ...Object.values(result.byResource).flat().map(x => x.period),
      ]);
  
      if (seriesIndex === 0) {
        const pts = this.adaptLegacySeries(result.overall, mode, periodsSorted);
        this.drawInternal(pts, baselineValue);
        return;
      }
  
      // Найдём k-го по порядку ресурс
      const ridList = Object.keys(result.byResource).map(n => Number(n)).filter(Number.isFinite).sort((a,b)=>a-b);
      const rid = ridList[seriesIndex - 1];
      const list = rid != null ? result.byResource[rid] ?? [] : [];
      const pts = this.adaptLegacySeries(list, mode, periodsSorted);
      this.drawInternal(pts, baselineValue);
    }
  
    /** Переотрисовать под другой размер */
    resizeWithHistogram(totalWidth: number, totalHeight: number, result: AnyHistogramResult, seriesIndex = 0, mode: MetricMode = 'qty', baselineValue?: number) {
      this.setSize(totalWidth, totalHeight);
      this.drawFromHistogram(result, seriesIndex, mode, baselineValue);
    }
  
    /** Вкл/выкл серии из легенды */
    toggle(key: string) {
      if (!(key in this.vis)) return;
      this.vis[key] = !this.vis[key];
      // переключаем отображение
      this.svg.selectAll(`.bar-${key}`).attr('display', this.vis[key] ? null : 'none');
      this.svg.selectAll(`.line.${key}`).attr('display', this.vis[key] ? null : 'none');
      this.svg.selectAll(`.dot-${key}`).attr('display', this.vis[key] ? null : 'none');
      if (key === 'baseline') this.svg.selectAll('.baseline').attr('display', this.vis[key] ? null : 'none');
  
      // вид легенды
      this.svg.selectAll<SVGGElement, unknown>('.legend-item')
        .filter(function () { return this.getAttribute('data-key') === key; })
        .each((_d, _i, nodes) => {
          const item = d3.select(nodes[0]);
          item.select('circle').attr('opacity', this.vis[key] ? 1 : 0.35);
          item.select('text').attr('text-decoration', this.vis[key] ? null : 'line-through');
        });
    }
  
    // ---------- приватные методы ----------
  
    private isNewResult(r: any): r is HistogramResultNew {
      return r && Array.isArray(r.periods) && Array.isArray(r.data);
    }
    private isLegacyResult(r: any): r is HistogramResultLegacy {
      return r && Array.isArray(r.overall) && r.byResource && typeof r.byResource === 'object';
    }
  
    private uniqueSortedPeriods(periods: string[]): string[] {
      return Array.from(new Set(periods)).sort();
    }
  
    private adaptNewSeries(series: HistogramSeriesNew, mode: MetricMode, periods: string[]): ChartPoint[] {
      const byPeriod = new Map<string, NewHistogramPoint>();
      series.points.forEach(p => byPeriod.set(p.period, p));
  
      let sumP = 0, sumA = 0, sumR = 0;
      const rows: ChartPoint[] = [];
      for (const period of periods) {
        const src = byPeriod.get(period);
        const p = src ? (mode === 'qty' ? src.planned_qty   : src.planned_cost)   : 0;
        const a = src ? (mode === 'qty' ? src.actual_qty    : src.actual_cost)    : 0;
        const r = src ? (mode === 'qty' ? src.remaining_qty : src.remaining_cost) : 0;
        sumP += p; sumA += a; sumR += r;
        rows.push({
          label: period,
          planned: p, actual: a, remaining: r,
          plannedCumulative: sumP,
          actualCumulative: sumA,
          remainingCumulative: sumR,
        });
      }
      return rows;
    }
  
    private adaptLegacySeries(list: HistogramPointLegacy[], mode: MetricMode, periodsSorted: string[]): ChartPoint[] {
      const byPeriod = new Map<string, HistogramPointLegacy>();
      list.forEach(p => byPeriod.set(p.period, p));
  
      let sumP = 0, sumA = 0, sumR = 0;
      const rows: ChartPoint[] = [];
      for (const period of periodsSorted) {
        const src = byPeriod.get(period);
        const p = src ? (mode === 'qty' ? src.planned_qty   : src.planned_cost)   : 0;
        const a = src ? (mode === 'qty' ? src.actual_qty    : src.actual_cost)    : 0;
        const r = src ? (mode === 'qty' ? src.remaining_qty : src.remaining_cost) : 0;
        sumP += p; sumA += a; sumR += r;
        rows.push({
          label: period,
          planned: p, actual: a, remaining: r,
          plannedCumulative: sumP,
          actualCumulative: sumA,
          remainingCumulative: sumR,
        });
      }
      return rows;
    }
  
    /** Непосредственный рендер готовых точек */
    private drawInternal(data: ChartPoint[], baselineValue?: number) {
      this.g.selectAll('*').remove();
      if (!data.length || this.width <= 0 || this.height <= 0) return;
  
      // шкалы
      const x0 = d3.scaleBand<string>()
        .domain(data.map(d => d.label))
        .range([0, this.width])
        .paddingInner(0.2);
  
      const barKeys = ['planned', 'actual', 'remaining'] as const;
      const x1 = d3.scaleBand<typeof barKeys[number]>()
        .domain(barKeys)
        .range([0, x0.bandwidth()])
        .padding(0.05);
  
      const maxBar = d3.max(data, d => Math.max(d.planned, d.actual, d.remaining)) ?? 0;
      const yLeft = d3.scaleLinear()
        .domain([0, maxBar > 0 ? maxBar * 1.1 : 1])
        .range([this.height, 0])
        .nice();
  
      const cumulKeys = ['plannedCumulative', 'actualCumulative', 'remainingCumulative'] as const;
      const maxCumul = d3.max(data, d => Math.max(d.plannedCumulative, d.actualCumulative, d.remainingCumulative)) ?? 0;
      const yRight = d3.scaleLinear()
        .domain([0, maxCumul > 0 ? maxCumul * 1.1 : 1])
        .range([this.height, 0])
        .nice();
  
      // оси
      const fmt = (n: d3.NumberValue) => this.formatNumber(Number(n));
      const xAxis      = d3.axisBottom(x0);
      const yAxisLeft  = d3.axisLeft(yLeft).ticks(6).tickFormat(fmt as any);
      const yAxisRight = d3.axisRight(yRight).ticks(6).tickFormat(fmt as any);
  
      this.g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${this.height})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-40)')
        .attr('text-anchor', 'end');
  
      this.g.append('g')
        .attr('class', 'y-axis-left')
        .call(yAxisLeft);
  
      this.g.append('g')
        .attr('class', 'y-axis-right')
        .attr('transform', `translate(${this.width},0)`)
        .call(yAxisRight);
  
      // подписи осей
      const leftLabel  = this.i18n.translate('hist.axis.left');   // напр. «Периодические»
      const rightLabel = this.i18n.translate('hist.axis.right');  // напр. «Накопительные»
      this.addYAxisLabel(this.g, leftLabel,  true);
      this.addYAxisLabel(this.g, rightLabel, false);
  
      // столбцы
      const groups = this.g.selectAll('.period-group')
        .data(data)
        .enter()
        .append('g')
        .attr('class', 'period-group')
        .attr('transform', d => `translate(${x0(d.label)},0)`);
  
      barKeys.forEach(key => {
        groups.append('rect')
          .attr('class', `bar bar-${key}`)
          .attr('x', () => x1(key)!)
          .attr('y', d => yLeft(d[key]))
          .attr('width', x1.bandwidth())
          .attr('height', d => this.height - yLeft(d[key]))
          .attr('fill', colors[key])
          .attr('display', this.vis[key] ? null : 'none')
          .on('mouseover', (ev, d) => this.onHover('bar', key, ev, d.label, d[key]))
          .on('mousemove', (ev) => this.moveTooltip(ev))
          .on('mouseout', () => this.onLeave());
      });
  
      // линии + точки
      const line = (key: keyof ChartPoint) => d3.line<ChartPoint>()
        .x(d => x0(d.label)! + x0.bandwidth() / 2)
        .y(d => yRight(d[key] as number))
        .curve(d3.curveMonotoneX);
  
      (cumulKeys as unknown as (keyof ChartPoint)[]).forEach(key => {
        this.g.append('path')
          .datum(data)
          .attr('class', `line ${String(key)}`)
          .attr('d', line(key)(data)!)
          .attr('stroke', colors[key as keyof typeof colors])
          .attr('stroke-width', 2)
          .attr('fill', 'none')
          .attr('display', this.vis[String(key)] ? null : 'none')
          .on('mouseover', (ev) => this.onHover('line', String(key), ev, data[0].label, (data[0] as any)[key]))
          .on('mousemove', (ev) => this.moveTooltip(ev))
          .on('mouseout', () => this.onLeave());
  
        this.g.selectAll(`.dot-${String(key)}`)
          .data(data)
          .enter()
          .append('circle')
          .attr('class', `dot dot-${String(key)}`)
          .attr('cx', d => x0(d.label)! + x0.bandwidth() / 2)
          .attr('cy', d => yRight((d as any)[key] ?? 0))
          .attr('r', 3.5)
          .attr('fill', colors[key as keyof typeof colors])
          .attr('display', this.vis[String(key)] ? null : 'none')
          .on('mouseover', (ev, d) => this.onHover('line', String(key), ev, d.label, (d as any)[key]))
          .on('mousemove', (ev) => this.moveTooltip(ev))
          .on('mouseout', () => this.onLeave());
      });
  
      // базовая линия
      if (typeof baselineValue === 'number') {
        this.g.append('line')
          .attr('class', 'baseline')
          .attr('x1', 0).attr('x2', this.width)
          .attr('y1', yLeft(baselineValue))
          .attr('y2', yLeft(baselineValue))
          .attr('stroke', colors.baseline)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6 4')
          .attr('display', this.vis['baseline'] ? null : 'none')
          .on('mouseover', (ev) => this.onHover('line', 'baseline', ev, '', baselineValue))
          .on('mousemove', (ev) => this.moveTooltip(ev))
          .on('mouseout', () => this.onLeave());
      }
  
      // легенда
      this.renderLegend();
    }
  
    // ----- UI helpers -----
  
    private renderLegend() {
      this.g.selectAll('.legend').remove();
  
      const legend = this.g.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(0, ${this.height + 8})`);
  
      const items = legend.selectAll('.legend-item')
        .data(legendItems)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('data-key', d => d.key)
        .style('cursor', 'pointer')
        .on('click', (_ev, d) => this.toggle(d.key));
  
      const spacingX = 12, spacingItem = 14, rowH = 20;
      let x = 0, y = 0;
  
      items.each((_d, i, nodes) => {
        const item = d3.select(nodes[i]);
        item.attr('transform', `translate(${x},${y})`);
        const d = item.datum() as (typeof legendItems)[number];
  
        item.append('circle')
          .attr('r', 6)
          .attr('fill', d.color)
          .attr('opacity', this.vis[d.key] ? 1 : 0.35);
  
        const text = item.append('text')
          .attr('x', 10)
          .attr('dy', '0.35em')
          .attr('font-size', '11px')
          .text(this.i18n.translate(d.labelKey))
          .attr('text-decoration', this.vis[d.key] ? null : 'line-through');
  
        const w = (text.node() as SVGTextElement).getBBox().width + 10 + spacingX;
        if (x + w > this.width) { x = 0; y += rowH; item.attr('transform', `translate(${x},${y})`); }
        x += w + spacingItem;
      });
    }
  
    private addYAxisLabel(g: d3.Selection<any, any, any, any>, text: string, isLeft: boolean) {
      const axisSel = g.select(isLeft ? '.y-axis-left' : '.y-axis-right');
      if (axisSel.empty()) return;
      const ticks = axisSel.selectAll<SVGTextElement, unknown>('text').nodes();
      const maxW = ticks.length ? Math.max(...ticks.map(t => t.getBBox().width)) : 0;
      const pad = 12;
      g.append('text')
        .attr('transform', isLeft
          ? `translate(${- (maxW + pad)}, ${this.height / 2}) rotate(-90)`
          : `translate(${this.width + maxW + pad}, ${this.height / 2}) rotate(-90)`)
        .attr('font-size', '10px')
        .attr('text-anchor', 'middle')
        .text(text);
    }
  
    private onHover(type: 'bar' | 'line', key: string, ev: MouseEvent, label: string, value: number) {
      this.highlight(type, key);
      const [mx, my] = d3.pointer(ev, this.svg.node() as SVGSVGElement);
      const seriesLabel = this.i18n.translate(this.legendKey(key));
      const html = key === 'baseline'
        ? `<strong>${seriesLabel}</strong>: ${this.formatNumber(value)}`
        : `<strong>${label}</strong><br/>${seriesLabel}: ${this.formatNumber(value)}`;
      this.tooltip
        .html(html)
        .style('left', `${mx + margin.left - 40}px`)
        .style('top',  `${my + margin.top  - 30}px`)
        .style('visibility', 'visible');
    }
  
    private moveTooltip(ev: MouseEvent) {
      const [mx, my] = d3.pointer(ev, this.svg.node() as SVGSVGElement);
      this.tooltip.style('left', `${mx + margin.left - 40}px`).style('top', `${my + margin.top - 30}px`);
    }
  
    private onLeave() {
      this.resetHighlight();
      this.tooltip.style('visibility', 'hidden');
    }
  
    private highlight(type: 'bar'|'line', activeKey: string) {
      this.svg.selectAll('.bar,.line,.dot').attr('opacity', 1);
      if (type === 'bar') {
        this.svg.selectAll('.bar')
          .filter(function() { return !d3.select(this).classed(`bar-${activeKey}`); })
          .attr('opacity', 0.3);
        this.svg.selectAll('.line,.dot').attr('opacity', 0.3);
      } else {
        this.svg.selectAll('.line')
          .filter(function() { return !d3.select(this).classed(activeKey); })
          .attr('opacity', 0.3);
        this.svg.selectAll('.bar').attr('opacity', 0.3);
        this.svg.selectAll('.dot')
          .filter(function() { return !d3.select(this).classed(`dot-${activeKey}`); })
          .attr('opacity', 0.3);
      }
    }
  
    private resetHighlight() {
      this.svg.selectAll('.bar,.line,.dot').attr('opacity', 1);
    }
  
    private legendKey(key: string) {
      const item = legendItems.find(x => x.key === key);
      return item?.labelKey ?? key;
    }
  
    /** Формат с приставками (тыс/млн/млрд) с Transloco */
    private formatNumber(n: number): string {
      const kT = this.i18n.translate('projects.cost.prefix.thousand');
      const kM = this.i18n.translate('projects.cost.prefix.million');
      const kB = this.i18n.translate('projects.cost.prefix.billion');
      const v = Math.abs(n);
      if (v >= 1e9) return (n / 1e9).toFixed(1) + ' ' + kB;
      if (v >= 1e6) return (n / 1e6).toFixed(1) + ' ' + kM;
      if (v >= 1e3) return (n / 1e3).toFixed(1) + ' ' + kT;
      return String(n);
    }
  }
  
  // ====== Standalone компонент-виджет ======
  
  @Component({
    selector: 'histogramchart',
    standalone: true,
    imports: [CommonModule],
    template: `
      <div class="histogramchart-wrap" #wrap>
        <svg #svgEl></svg>
        <div #tooltipEl class="histogramchart-tooltip"></div>
      </div>
    `,
    styles: [`
      :host { display:block; width:100%; }
      .histogramchart-wrap { position:relative; width:100%; }
      .histogramchart-tooltip {
        position:absolute; pointer-events:none; visibility:hidden;
        background:rgba(0,0,0,.8); color:#fff; padding:6px 8px; border-radius:4px;
        font: 12px/1.2 sans-serif; z-index:10;
      }
      svg { display:block; width:100%; height:auto; }
    `],
    providers: [HistogramChartD3Service]
  })
  export class HistogramChartComponent implements AfterViewInit, OnChanges, OnDestroy {
    /** Данные: ChartPoint[] или HistogramResult (новый/старый формат) */
    @Input() data: ChartPoint[] | AnyHistogramResult | null = null;
    /** Режим метрики для HistogramResult */
    @Input() mode: MetricMode = 'qty';
    /** Какую серию из HistogramResult рисовать (0 — overall) */
    @Input() seriesIndex = 0;
    /** Высота SVG (px) */
    @Input() height = 360;
    /** Опционально: горизонтальная базовая линия */
    @Input() baselineValue?: number;
  
    @ViewChild('svgEl',    { static: true }) svgRef!: ElementRef<SVGSVGElement>;
    @ViewChild('tooltipEl',{ static: true }) tooltipRef!: ElementRef<HTMLDivElement>;
    @ViewChild('wrap',     { static: true }) wrapRef!: ElementRef<HTMLDivElement>;
  
    private ro?: ResizeObserver;
    private viewReady = false;
  
    constructor(private drawer: HistogramChartD3Service) {}
  
    // В компоненте
    private win: (Window & typeof globalThis) | null =
    typeof window !== 'undefined' ? (window as unknown as Window & typeof globalThis) : null;


    ngAfterViewInit(): void {
      this.drawer.init(this.svgRef.nativeElement, this.tooltipRef.nativeElement);
      this.drawer.setSize(this.wrapWidth(), this.height);
      this.viewReady = true;
      this.render();
    
      const g = globalThis as any;
    
      if (g && typeof g.ResizeObserver === 'function') {
        const ro: ResizeObserver = new g.ResizeObserver(() => {
          this.drawer.setSize(this.wrapWidth(), this.height);
          this.render();
        });
        ro.observe(this.wrapRef.nativeElement);  // ← TS точно знает, что ro создан
        this.ro = ro;                            // ← сохраняем для onDestroy
      } else if (typeof window !== 'undefined') {
        window.addEventListener('resize', this.onWindowResize as EventListener);
      }
    }
    
    ngOnDestroy(): void {
      this.ro?.disconnect(); // ← optional chaining
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', this.onWindowResize as EventListener);
      }
    }
    
    private onWindowResize: EventListener = () => {
      this.drawer.setSize(this.wrapWidth(), this.height);
      this.render();
    };
  
    ngOnChanges(ch: SimpleChanges): void {
      if (!this.viewReady) return;
      if (ch['data'] || ch['mode'] || ch['seriesIndex'] || ch['baselineValue'] || ch['height']) {
        this.drawer.setSize(this.wrapWidth(), this.height);
        this.render();
      }
    }

  
    private render(): void {
      if (!this.data) { this.drawer.clear(); return; }
  
      if (Array.isArray(this.data)) {
        // прямые точки
        this.drawer.drawArray(this.data, this.baselineValue);
      } else {
        // HistogramResult (новый или старый)
        this.drawer.drawFromHistogram(this.data, this.seriesIndex, this.mode, this.baselineValue);
      }
    }
  

  
    private wrapWidth(): number {
      const el = this.wrapRef?.nativeElement as HTMLDivElement | undefined;
      return Math.max(0, el?.clientWidth ?? 0);
    }
  }
  