import {
    Component, Input, ElementRef, ViewChild,
    AfterViewInit, OnChanges, SimpleChanges, OnDestroy
  } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import * as d3 from 'd3';
  
  /* ===== Типы входа ===== */
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
    periods: string[];
    data: HistogramSeriesNew[];
    resources?: Array<{ rsrc_id: number; code: string; name: string }>;
  }
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
    overall: HistogramPointLegacy[];
    byResource: Record<number, HistogramPointLegacy[]>;
  }
  export type AnyHistogramResult = HistogramResultNew | HistogramResultLegacy;
  
  /** Также поддерживаем входной формат массива помесячных строк */
  export type MonthlyUnitsRow = {
    date: string; // 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'
    units: Array<{
      resource: string;
      Budgeted: number;
      Actual: number;
      Remaining: number;
      AtCompletionUnits: number;
    }>;
  };
  
  /* ===== Внутренние типы для рендера ===== */
  type MeasureKey = 'Budgeted' | 'Actual' | 'Remaining' | 'AtCompletionUnits';
  type RowObj = any;
  type Adapted = {
    periods: string[];
    resources: string[];
    rows: RowObj[];
  };
  
  @Component({
    selector: 'histogramPivotChart',
    standalone: true,
    imports: [CommonModule],
    template: `
      <div class="hpc-wrap" #wrap>
        <svg #svgEl></svg>
        <div #tooltipEl class="hpc-tooltip"></div>
      </div>
    `,
    styles: [`
      :host { display:block; width:100%; }
      .hpc-wrap { position:relative; width:100%; }
      .hpc-tooltip {
        position:absolute; pointer-events:none; visibility:hidden;
        background:rgba(0,0,0,.8); color:#fff; padding:6px 8px; border-radius:4px;
        font:12px/1.2 sans-serif; z-index:10; max-width:360px; white-space:nowrap;
      }
      svg { display:block; width:100%; height:auto; }
    `]
  })
  export class HistogramPivotChartComponent implements AfterViewInit, OnChanges, OnDestroy {
    /** Данные: HistogramResult(new/legacy) ИЛИ MonthlyUnitsRow[] */
    @Input() data: AnyHistogramResult | MonthlyUnitsRow[] | null = null;
    /** Высота графика (px) */
    @Input() height = 360;
    /** Выбор метрики: Budgeted | Actual | Remaining | AtCompletionUnits */
    @Input() value: MeasureKey = 'Budgeted';
  
    @ViewChild('svgEl',    { static: true }) svgRef!: ElementRef<SVGSVGElement>;
    @ViewChild('tooltipEl',{ static: true }) tooltipRef!: ElementRef<HTMLDivElement>;
    @ViewChild('wrap',     { static: true }) wrapRef!: ElementRef<HTMLDivElement>;
  
    private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private g!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private legendG!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private plotG!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private tooltip!: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    private ro?: ResizeObserver;
    private viewReady = false;
  
    private outerW = 0;
    private innerH = 0;
    private margin = { top: 40, right: 60, bottom: 40, left: 60 } as const;
  
    // Панель легенды слева
    private legendPad = 12;
    private legendW = 160;   // будет адаптироваться от ширины контейнера
    private plotW = 0;       // ширина области графика (без легенды)
  
    // состояние видимости по ресурсам (только для баров)
    private visByRes = new Map<string, boolean>();
  
    ngAfterViewInit(): void {
      this.svg = d3.select(this.svgRef.nativeElement);
      this.tooltip = d3.select(this.tooltipRef.nativeElement);
  
      // контейнер
      this.svg.append('g')
        .attr('class', 'hpc-container')
        .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
      this.g = this.svg.select<SVGGElement>('g.hpc-container')!;
  
      // две группы: легенда слева и поле графика справа
      this.legendG = this.g.append('g').attr('class', 'legend-left');
      this.plotG   = this.g.append('g').attr('class', 'plot-area');
  
      this.setSize(this.wrapWidth(), this.height);
      this.viewReady = true;
      this.render();
  
      const g = globalThis as any;
      if (g && typeof g.ResizeObserver === 'function') {
        const ro: ResizeObserver = new g.ResizeObserver(() => {
          this.setSize(this.wrapWidth(), this.height);
          this.render();
        });
        ro.observe(this.wrapRef.nativeElement);
        this.ro = ro;
      } else if (typeof window !== 'undefined') {
        window.addEventListener('resize', this.onWindowResize as EventListener);
      }
    }
  
    ngOnDestroy(): void {
      this.ro?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', this.onWindowResize as EventListener);
      }
    }
  
    private onWindowResize: EventListener = () => {
      this.setSize(this.wrapWidth(), this.height);
      this.render();
    };
  
    ngOnChanges(ch: SimpleChanges): void {
      if (!this.viewReady) return;
      if (ch['data'] || ch['height'] || ch['value']) {
        this.setSize(this.wrapWidth(), this.height);
        this.render();
      }
    }
  
    /* ===== Рендер ===== */
  
    private render(): void {
      this.plotG.selectAll('*').remove();
      this.legendG.selectAll('*').remove();
  
      const measure = String(this.value || 'Budgeted').trim() as MeasureKey;
      const adapted = this.adaptInput(this.data, measure);
      if (!adapted.periods.length || !adapted.resources.length) return;
  
      // Инициализируем видимость ресурсов (по умолчанию все включены), но сохраняем предыдущее состояние
      for (const r of adapted.resources) {
        if (!this.visByRes.has(r)) this.visByRes.set(r, true);
      }
  
      // Данные (все ресурсы всегда в дом-дереве)
      const rows: RowObj[] = adapted.rows;
  
      // Цвета по ресурсам
      const color = d3.scaleOrdinal<string>()
        .domain(adapted.resources)
        .range(d3.schemeTableau10.concat(d3.schemeSet3 as any).slice(0, adapted.resources.length));
  
      // Подготовка шкал и стека для БАРОВ (по всем ресурсам — масштаб стабилен)
      const x = d3.scaleBand<string>()
        .domain(adapted.periods)
        .range([0, this.plotW])
        .paddingInner(0.25);
  
      const stackGen = d3.stack<RowObj>()
        .keys(adapted.resources)
        .value((d, key) => Number.isFinite(d[key]) ? (d[key] as number) : 0);
  
      const stackedAll = stackGen(rows);
      const maxYBars = d3.max(stackedAll, s => d3.max(s, d => d[1])) ?? 0;
      const yLeft = d3.scaleLinear()
        .domain([0, maxYBars > 0 ? maxYBars * 1.1 : 1])
        .range([this.innerH, 0])
        .nice();
  
      // Оси (в plotArea)
      const xAxis = d3.axisBottom(x);
      const yAxisLeft = d3.axisLeft(yLeft).ticks(6).tickFormat(this.fmt as any);
  
      this.plotG.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${this.innerH})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-40)')
        .attr('text-anchor', 'end');
  
      this.plotG.append('g')
        .attr('class', 'y-axis-left')
        .call(yAxisLeft);
  
      // Слой баров: по всем ресурсам, видимость — через display
      const layer = this.plotG.selectAll('.layer')
        .data(stackedAll, (d: any) => d.key)
        .enter()
        .append('g')
        .attr('class', 'layer')
        .attr('fill', d => color((d as any).key)!)
        .attr('data-res', (d: any) => d.key)
        .attr('display', (d: any) => this.visByRes.get(d.key) ? null : 'none');
  
      const barW = x.bandwidth();
  
      layer.selectAll('rect')
        .data(d => d, (d: any) => (d.data as RowObj).label)
        .enter()
        .append('rect')
        .attr('x', d => x((d.data as RowObj).label)!)
        .attr('y', d => yLeft(d[1]))
        .attr('width', barW)
        .attr('height', d => Math.max(0, yLeft(d[0]) - yLeft(d[1])))
        .on('mouseover', (ev, d: any) => {
          const row = d.data as RowObj;
          const key = (d3.select(ev.currentTarget.parentNode as SVGGElement).datum() as any).key as string;
          const val = (row[key] ?? 0) as number;
          this.showTip(ev, `<strong>${row.label}</strong><br/>${key}: ${this.fmt(val)}`);
        })
        .on('mousemove', (ev) => this.moveTip(ev))
        .on('mouseout', () => this.hideTip());
  
      // Линия НАКОПЛЕНИЯ — по СУММЕ ВСЕХ ресурсов (не зависит от видимости баров)
      const totalsPerPeriodAll = adapted.periods.map(p => {
        const r = rows.find(x => x.label === p)!;
        return adapted.resources.reduce((s, k) => s + (r[k] ?? 0), 0);
      });
      const cumul: number[] = [];
      totalsPerPeriodAll.reduce((acc, v) => { const nv = acc + v; cumul.push(nv); return nv; }, 0);
  
      const yRight = d3.scaleLinear()
        .domain([0, d3.max(cumul) ?? 1])
        .range([this.innerH, 0])
        .nice();
  
      const pairs: [string, number][] = adapted.periods.map((p, i) => [p, cumul[i]]);
      const line = d3.line<[string, number]>()
        .x(([lbl]) => (x(lbl)! + barW / 2))
        .y(([,v]) => yRight(v))
        .curve(d3.curveMonotoneX);
  
      this.plotG.append('path')
        .attr('class', 'cum-line')
        .attr('fill', 'none')
        .attr('stroke', '#444')
        .attr('stroke-width', 2)
        .attr('d', line(pairs) as string);
  
      this.plotG.selectAll('.cum-dot')
        .data(pairs)
        .enter()
        .append('circle')
        .attr('class', 'cum-dot')
        .attr('cx', d => x(d[0])! + barW / 2)
        .attr('cy', d => yRight(d[1]))
        .attr('r', 3.5)
        .attr('fill', '#444')
        .on('mouseover', (ev, d) => this.showTip(ev, `<strong>${d[0]}</strong><br/>Cumulative: ${this.fmt(d[1])}`))
        .on('mousemove', (ev) => this.moveTip(ev))
        .on('mouseout', () => this.hideTip());
  
      // Правая ось для линии
      const yAxisRight = d3.axisRight(yRight).ticks(6).tickFormat(this.fmt as any);
      this.plotG.append('g')
        .attr('class', 'y-axis-right')
        .attr('transform', `translate(${this.plotW},0)`)
        .call(yAxisRight);
  
      // Подписи осей
      this.addYAxisLabel(this.plotG, 'Units (periodic)',  true, this.plotW);
      this.addYAxisLabel(this.plotG, 'Units (cumulative)', false, this.plotW);
  
      // ЛЕВАЯ легенда: вертикальный список ресурсов, кликом — только БАРЫ
      this.renderLegendLeft(adapted.resources, color);
    }
  
    /* ===== Легенда слева ===== */
  
    private renderLegendLeft(allRes: string[], color: d3.ScaleOrdinal<string, string>) {
      // Заголовок легенды
      this.legendG.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .text('Resources');
  
      const items = this.legendG.selectAll('.legend-item')
        .data(allRes, d => d as string)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .style('cursor', 'pointer')
        .attr('transform', (_d, i) => `translate(0, ${16 + i * 20})`)
        .on('click', (ev, res: string) => {
          const now = !this.visByRes.get(res);
          this.visByRes.set(res, now);
  
          // Переключаем только слой баров соответствующего ресурса
          this.plotG.selectAll<SVGGElement, any>('.layer')
            .filter(function() { return (d3.select(this).attr('data-res') ?? '') === res; })
            .attr('display', now ? null : 'none');
  
          // Обновляем вид элемента легенды
          const item = d3.select(ev.currentTarget as SVGGElement);
          item.select('circle').attr('opacity', now ? 1 : 0.3);
          item.select('text').attr('text-decoration', now ? null : 'line-through');
        });
  
      items.append('circle')
        .attr('r', 6)
        .attr('cx', 6)
        .attr('cy', 6)
        .attr('fill', r => color(r) ?? '#999')
        .attr('opacity', r => this.visByRes.get(r) ? 1 : 0.3);
  
      items.append('text')
        .attr('x', 18)
        .attr('y', 6)
        .attr('dy', '0.32em')
        .attr('font-size', '11px')
        .text(r => r)
        .attr('text-decoration', r => this.visByRes.get(r) ? null : 'line-through');
    }
  
    /* ===== Адаптация входных данных ===== */
  
    private adaptInput(input: AnyHistogramResult | MonthlyUnitsRow[] | null, measure: MeasureKey): Adapted {
      if (!input) return { periods: [], resources: [], rows: [] };
  
      // MonthlyUnitsRow[]
      if (Array.isArray(input) && input.length > 0 && 'units' in input[0]) {
        const periods = Array.from(new Set(input.map(r => r.date))).sort();
        const resSet = new Set<string>();
        for (const r of input) for (const u of r.units) resSet.add(u.resource);
        const resources = Array.from(resSet).sort((a,b)=>a.localeCompare(b));
  
        const rows: RowObj[] = periods.map(p => {
          const entry = input.find(r => r.date === p);
          const obj: RowObj = { label: p };
          for (const name of resources) {
            const u = entry?.units.find(x => x.resource === name);
            obj[name] = this.pickMeasureFromMonthly(u, measure);
          }
          return obj;
        });
        return { periods, resources, rows };
      }
  
      // HistogramResult (new/legacy)
      if (this.isNew(input)) return this.adaptNew(input, measure);
      if (this.isLegacy(input)) return this.adaptLegacy(input, measure);
  
      return { periods: [], resources: [], rows: [] };
    }
  
    private isNew(r: any): r is HistogramResultNew {
      return !!r && Array.isArray(r.periods) && Array.isArray(r.data);
    }
    private isLegacy(r: any): r is HistogramResultLegacy {
      return !!r && Array.isArray(r.overall) && r.byResource && typeof r.byResource === 'object';
    }
  
    private adaptNew(result: HistogramResultNew, measure: MeasureKey): Adapted {
      const periods = Array.from(new Set(result.periods)).sort();
      const nameByRid = new Map<number, string>();
      if (Array.isArray(result.resources)) {
        for (const r of result.resources) nameByRid.set(r.rsrc_id, r.name || r.code || String(r.rsrc_id));
      }
      const series = result.data.slice(1); // 0 — overall
      const resSet = new Set<string>();
      for (const s of series) {
        const nm = s.rsrc_id != null ? (nameByRid.get(s.rsrc_id) ?? String(s.rsrc_id)) : 'ALL';
        resSet.add(nm);
      }
      const resources = Array.from(resSet).sort((a,b)=>a.localeCompare(b));
  
      const rows: RowObj[] = periods.map(p => ({ label: p }));
      const rowByLabel = new Map<string, RowObj>();
      for (const r of rows) rowByLabel.set(r.label, r);
  
      for (const s of series) {
        const resName = s.rsrc_id != null ? (nameByRid.get(s.rsrc_id) ?? String(s.rsrc_id)) : 'ALL';
        for (const pt of s.points ?? []) {
          const lbl = pt.period;
          const row = rowByLabel.get(lbl);
          if (!row) continue;
          row[resName] = (row[resName] ?? 0) + this.pickMeasureFromPoint(pt, measure);
        }
      }
      for (const r of rows) for (const name of resources) r[name] = r[name] ?? 0;
  
      return { periods, resources, rows };
    }
  
    private adaptLegacy(result: HistogramResultLegacy, measure: MeasureKey): Adapted {
      const periods = Array.from(new Set([
        ...result.overall.map(x => x.period),
        ...Object.values(result.byResource).flat().map(x => x.period),
      ])).sort();
  
      const resIds = Object.keys(result.byResource).map(n => Number(n)).filter(Number.isFinite);
      const resources = resIds.map(id => String(id)).sort((a,b)=>a.localeCompare(b));
  
      const rows: RowObj[] = periods.map(p => ({ label: p }));
      const rowByLabel = new Map<string, RowObj>();
      for (const r of rows) rowByLabel.set(r.label, r);
  
      for (const ridStr of Object.keys(result.byResource)) {
        const resName = ridStr;
        for (const pt of (result.byResource[Number(ridStr)] ?? [])) {
          const row = rowByLabel.get(pt.period);
          if (!row) continue;
          row[resName] = (row[resName] ?? 0) + this.pickMeasureFromLegacyPoint(pt, measure);
        }
      }
      for (const r of rows) for (const name of resources) r[name] = r[name] ?? 0;
  
      return { periods, resources, rows };
    }
  
    private pickMeasureFromPoint(p: NewHistogramPoint, m: MeasureKey): number {
      if (m === 'Budgeted')          return this.num(p.planned_qty);
      if (m === 'Actual')            return this.num(p.actual_qty);
      if (m === 'Remaining')         return this.num(p.remaining_qty);
      /* m === 'AtCompletionUnits' */return this.num(p.actual_qty) + this.num(p.remaining_qty);
    }
    private pickMeasureFromLegacyPoint(p: HistogramPointLegacy, m: MeasureKey): number {
      if (m === 'Budgeted')          return this.num(p.planned_qty);
      if (m === 'Actual')            return this.num(p.actual_qty);
      if (m === 'Remaining')         return this.num(p.remaining_qty);
      /* m === 'AtCompletionUnits' */return this.num(p.actual_qty) + this.num(p.remaining_qty);
    }
    private pickMeasureFromMonthly(u: MonthlyUnitsRow['units'][number] | undefined, m: MeasureKey): number {
      if (!u) return 0;
      if (m === 'Budgeted')          return this.num(u.Budgeted);
      if (m === 'Actual')            return this.num(u.Actual);
      if (m === 'Remaining')         return this.num(u.Remaining);
      /* m === 'AtCompletionUnits' */return this.num(u.AtCompletionUnits);
    }
  
    /* ===== UI utils ===== */
  
    private addYAxisLabel(g: d3.Selection<any, any, any, any>, text: string, isLeft: boolean, plotWidth: number) {
      const axisSel = g.select(isLeft ? '.y-axis-left' : '.y-axis-right');
      if (axisSel.empty()) return;
      const ticks = axisSel.selectAll<SVGTextElement, unknown>('text').nodes();
      const maxW = ticks.length ? Math.max(...ticks.map(t => t.getBBox().width)) : 0;
      const pad = 12;
      g.append('text')
        .attr('transform', isLeft
          ? `translate(${- (maxW + pad)}, ${this.innerH / 2}) rotate(-90)`
          : `translate(${plotWidth + maxW + pad}, ${this.innerH / 2}) rotate(-90)`)
        .attr('font-size', '10px')
        .attr('text-anchor', 'middle')
        .text(text);
    }
  
    private showTip(ev: MouseEvent, html: string) {
      const [mx, my] = d3.pointer(ev, this.svg.node() as SVGSVGElement);
      this.tooltip.html(html)
        .style('left', `${mx + this.margin.left - 40}px`)
        .style('top',  `${my + this.margin.top  - 30}px`)
        .style('visibility', 'visible');
    }
    private moveTip(ev: MouseEvent) {
      const [mx, my] = d3.pointer(ev, this.svg.node() as SVGSVGElement);
      this.tooltip.style('left', `${mx + this.margin.left - 40}px`).style('top', `${my + this.margin.top - 30}px`);
    }
    private hideTip() { this.tooltip.style('visibility', 'hidden'); }
  
    private setSize(totalWidth: number, totalHeight: number) {
      this.outerW = Math.max(0, totalWidth - this.margin.left - this.margin.right);
      this.innerH = Math.max(0, totalHeight - this.margin.top - this.margin.bottom);
  
      // ширина панели легенды (адаптивно), но в разумных пределах
      const minLegend = 140, maxLegend = 240;
      this.legendW = Math.max(minLegend, Math.min(maxLegend, Math.floor(this.outerW * 0.22)));
  
      // позиционирование групп
      this.legendG.attr('transform', `translate(0,0)`);
      this.plotW = Math.max(0, this.outerW - this.legendW - this.legendPad);
      this.plotG.attr('transform', `translate(${this.legendW + this.legendPad},0)`);
  
      this.svg.attr('width', totalWidth).attr('height', totalHeight);
    }
  
    private wrapWidth(): number {
      const el = this.wrapRef?.nativeElement as HTMLDivElement | undefined;
      return Math.max(0, el?.clientWidth ?? 0);
    }
  
    private num(x: any): number { const n = Number(x); return Number.isFinite(n) ? n : 0; }
    private fmt = (n: d3.NumberValue) => {
      const v = Number(n); const a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(1) + ' B';
      if (a >= 1e6) return (v / 1e6).toFixed(1) + ' M';
      if (a >= 1e3) return (v / 1e3).toFixed(1) + ' K';
      return String(v);
    };
  }
  