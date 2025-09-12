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
  date: string;
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
type Adapted = { periods: string[]; resources: string[]; rows: RowObj[]; };
type TotalsMap = Record<MeasureKey, number>;

@Component({
  selector: 'histogramPivotChart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="hpc-wrap" #wrap>
      <div class="hpc-legend" #legendHost>
        <svg #legendSvg class="legend-svg"></svg>
      </div>
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

    /* Легенда: HTML контейнер (скролл) + SVG внутри */
    .hpc-legend {
      position:absolute;
      overflow-y:auto;
      overflow-x:hidden;
      background:transparent;
      /* left/top/width/height задаются из TS */
    }
    .legend-svg { display:block; width:100%; height:auto; }

    .legend-title { font:600 12px/1.4 sans-serif; }
    .legend-row, .legend-row text, .legend-row circle { cursor: pointer; }
    .legend-item-text { font: 11px/1.2 sans-serif; dominant-baseline: middle; }
    .off .legend-item-text { text-decoration: line-through; fill: #6b7280; }

    
  `]
})
export class HistogramPivotChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() data: AnyHistogramResult | MonthlyUnitsRow[] | null = null;
  @Input() height = 360;
  @Input() value: MeasureKey = 'Budgeted';

  @ViewChild('svgEl',     { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltipEl', { static: true }) tooltipRef!: ElementRef<HTMLDivElement>;
  @ViewChild('wrap',      { static: true }) wrapRef!: ElementRef<HTMLDivElement>;
  @ViewChild('legendHost',{ static: true }) legendHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('legendSvg', { static: true }) legendSvgRef!: ElementRef<SVGSVGElement>;

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private plotG!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private tooltip!: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private ro?: ResizeObserver;
  private viewReady = false;

  private outerW = 0;
  private innerH = 0;
  private margin = { top: 40, right: 60, bottom: 40, left: 60 } as const;

  private legendPad = 12;
  private legendW = 160;
  private plotW = 0;

  private visByRes = new Map<string, boolean>();
  private lastAdapted: Adapted | null = null;

  /** дополнительный «запас слева» под подпись левой оси, пиксели */
  private leftYAxisGutterPx = 0;

  ngAfterViewInit(): void {
    this.svg = d3.select(this.svgRef.nativeElement);
    this.tooltip = d3.select(this.tooltipRef.nativeElement);

    this.svg.append('g')
      .attr('class', 'hpc-container')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
    this.g = this.svg.select<SVGGElement>('g.hpc-container')!;
    this.plotG = this.g.append('g').attr('class', 'plot-area');

    this.setSize(this.wrapWidth(), this.height);
    this.viewReady = true;
    this.render();

    const g = globalThis as any;
    if (g && typeof g.ResizeObserver === 'function') {
      const ro: ResizeObserver = new g.ResizeObserver(() => {
        this.setSize(this.wrapWidth(), this.height);
        this.redrawFromCache();
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
    this.redrawFromCache();
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
    const legendSvg = d3.select(this.legendSvgRef.nativeElement);
    legendSvg.selectAll('*').remove();
    this.leftYAxisGutterPx = 0;

    const measure = String(this.value || 'Budgeted').trim() as MeasureKey;

    const totalsAll = this.computeTotalsForAllMeasures(this.data);
    this.logTotals(totalsAll, measure);

    const adapted = this.adaptInput(this.data, measure);
    this.lastAdapted = adapted;
    if (!adapted.periods.length || !adapted.resources.length) return;

    for (const r of adapted.resources) if (!this.visByRes.has(r)) this.visByRes.set(r, true);

    const color = d3.scaleOrdinal<string>()
      .domain(adapted.resources)
      .range(d3.schemeTableau10.concat(d3.schemeSet3 as any).slice(0, adapted.resources.length));

    this.renderLegendLeftSVG(adapted.resources, color);
    this.drawChart(adapted, color);
  }

  private redrawFromCache(): void {
    if (!this.lastAdapted) return;
    const adapted = this.lastAdapted;

    const color = d3.scaleOrdinal<string>()
      .domain(adapted.resources)
      .range(d3.schemeTableau10.concat(d3.schemeSet3 as any).slice(0, adapted.resources.length));

    this.renderLegendLeftSVG(adapted.resources, color);
    this.drawChart(adapted, color);
  }

  private rightGutterRelaxPx = 40; 

  private drawChart(adapted: Adapted, color: d3.ScaleOrdinal<string, string>) {
    this.plotG.selectAll('*').remove();
    this.leftYAxisGutterPx = 0;
  
    const visibleRes = adapted.resources.filter(r => this.visByRes.get(r));
    const rows: RowObj[] = adapted.rows;
  
    // --- Вертикальные масштабы (не зависят от ширины) ---
    // Для левой оси нужен стек (для max по барам)
    const stackGenForY = d3.stack<RowObj>()
      .keys(visibleRes)
      .value((d, key) => Number.isFinite(d[key]) ? (d[key] as number) : 0);
    const stackedVisible = stackGenForY(rows);
  
    const maxYBars = d3.max(stackedVisible, s => d3.max(s, d => d[1])) ?? 0;
    const yLeft = d3.scaleLinear()
      .domain([0, maxYBars > 0 ? maxYBars * 1.1 : 1])
      .range([this.innerH, 0])
      .nice();
  
    // Кумулятив по видимым — для правой оси
    const totalsPerPeriodVisible = adapted.periods.map(p => {
      const r = rows.find(x => x.label === p)!;
      return visibleRes.reduce((s, k) => s + (r[k] ?? 0), 0);
    });
    const cumul: number[] = [];
    totalsPerPeriodVisible.reduce((acc, v) => { const nv = acc + v; cumul.push(nv); return nv; }, 0);
  
    const yRight = d3.scaleLinear()
      .domain([0, d3.max(cumul) ?? 1])
      .range([this.innerH, 0])
      .nice();
  
    // --- СУЖАЕМ ПОЛЕ ГРАФИКА под правую подпись ---
    const neededRight = this.measureRightGutter(yRight, 'Units (cumulative)');
    const shrink = Math.max(0, neededRight - this.rightGutterRelaxPx);
    this.plotW = Math.max(0, this.plotW - shrink);
  
    // --- Горизонтальная шкала с обновлённой шириной ---
    const x = d3.scaleBand<string>()
      .domain(adapted.periods)
      .range([0, this.plotW])
      .paddingInner(0.25);
  
    const xAxis = d3.axisBottom(x);
    const yAxisLeft = d3.axisLeft(yLeft).ticks(6).tickFormat(this.fmt as any);
    const yAxisRight = d3.axisRight(yRight).ticks(6).tickFormat(this.fmt as any);
  
    // Оси
    this.plotG.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${this.innerH})`)
      .call(xAxis)
      .selectAll('text')
      .attr('transform', 'rotate(-40)')
      .attr('text-anchor', 'end');
  
    this.plotG.append('g').attr('class', 'y-axis-left').call(yAxisLeft);
    this.plotG.append('g')
      .attr('class', 'y-axis-right')
      .attr('transform', `translate(${this.plotW},0)`)
      .call(yAxisRight);
  
    // Бары (используем тот же стек, но с x/width)
    const barW = x.bandwidth();
    const stackGenForBars = d3.stack<RowObj>()
      .keys(visibleRes)
      .value((d, key) => Number.isFinite(d[key]) ? (d[key] as number) : 0);
    const stackedForBars = stackGenForBars(rows);
  
    const layers = this.plotG.selectAll('.layer').data(stackedForBars, (d: any) => d.key);
    const layersEnter = layers.enter()
      .append('g')
      .attr('class', 'layer')
      .attr('fill', (d: any) => color(d.key)!);
  
    layersEnter.selectAll('rect')
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
  
    // Линия кумулятива
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
  
    // Подписи осей (всегда снаружи)
    this.addYAxisLabelSmart(true,  'Units (periodic)');
    this.addYAxisLabelSmart(false, 'Units (cumulative)');
  
    // Сдвигаем легенду левее, если нужно (чтобы не наезжала на левую подпись)
    this.positionLegendHost();
  }
  

  /* ===== Легенда слева: SVG внутри прокручиваемого контейнера ===== */

  private renderLegendLeftSVG(allRes: string[], color: d3.ScaleOrdinal<string, string>) {
    this.sizeLegendHost(); // задаём размеры до рендера
    const svg = d3.select(this.legendSvgRef.nativeElement);
    svg.selectAll('*').remove();

    const rowH = 22;
    const topPad = 16;
    const totalH = topPad + allRes.length * rowH;
    svg.attr('width', this.legendW).attr('height', Math.max(totalH, this.innerH));

    svg.append('text')
      .attr('class', 'legend-title')
      .attr('x', 0)
      .attr('y', 12)
      .text('Resources');

    const items = svg.selectAll<SVGGElement, string>('.legend-row').data(allRes, d => d);

    const enter = items.enter()
      .append('g')
      .attr('class', d => `legend-row ${this.visByRes.get(d) ? '' : 'off'}`)
      .attr('transform', (_d, i) => `translate(0, ${topPad + i * rowH})`)
      .on('click', (_ev, res: string) => {
        const now = !this.visByRes.get(res);
        this.visByRes.set(res, now);
        const rowSel = svg.selectAll<SVGGElement, string>('.legend-row').filter(d => d === res);
        rowSel.classed('off', !now);
        rowSel.select('circle').style('fill', now ? (color(res) ?? '#999') : '#9e9e9e');
        this.redrawFromCache();
      });

    enter.append('circle')
      .attr('cx', 8)
      .attr('cy', rowH / 2)
      .attr('r', 6)
      .style('fill', r => (this.visByRes.get(r) ? (color(r) ?? '#999') : '#9e9e9e'));

    enter.append('text')
      .attr('class', 'legend-item-text')
      .attr('x', 22)
      .attr('y', rowH / 2)
      .attr('dominant-baseline', 'middle')
      .attr('style', 'cursor:pointer; user-select:none; -webkit-user-select:none;')
      .text(r => r);
  }

  /** Задаём width/height легенды; позицию вычисляем отдельно (учитывая подпись оси) */
  private sizeLegendHost() {
    const host = this.legendHostRef.nativeElement;
    host.style.width  = `${this.legendW}px`;
    host.style.height = `${this.innerH}px`;
    // позиция будет выставлена в positionLegendHost()
    this.g.attr('transform', `translate(${this.margin.left},${this.margin.top})`);
    this.plotG.attr('transform', `translate(${this.legendW + this.legendPad},0)`);
  }

  /** Сдвигаем легенду левее на ширину подписи левой оси */
  private positionLegendHost() {
    const host = this.legendHostRef.nativeElement;
    const left = Math.max(0, this.margin.left - this.leftYAxisGutterPx);
    host.style.left = `${left}px`;
    host.style.top  = `${this.margin.top}px`;
  }

  /* ===== Умная подпись осей по Y + вычисление «гуттера» слева ===== */
  private addYAxisLabelSmart(isLeft: boolean, text: string) {
    const axisSel = this.plotG.select(isLeft ? '.y-axis-left' : '.y-axis-right');
    if (axisSel.empty()) return;
  
    const ticks = axisSel.selectAll<SVGTextElement, unknown>('text').nodes();
    const tickMaxW = ticks.length ? Math.max(...ticks.map(t => t.getBBox().width)) : 0;
    const padTicks = 8;
  
    const tmp = this.plotG.append('text')
      .attr('font-size', '10px')
      .attr('visibility', 'hidden')
      .text(text);
    const labelH = (tmp.node() as SVGTextElement).getBBox().height;
    tmp.remove();
  
    this.plotG.select(isLeft ? '.y-axis-label-left' : '.y-axis-label-right').remove();
  
    const baseX = isLeft
      ? - (tickMaxW + padTicks + labelH / 2)
      : this.plotW + tickMaxW + padTicks + labelH / 2;
  
    const x = isLeft ? baseX : baseX + this.rightYAxisLabelShiftPx; // <- добавили сдвиг вправо
    const y = this.innerH / 2;
  
    this.plotG.append('text')
      .attr('class', isLeft ? 'y-axis-label-left' : 'y-axis-label-right')
      .attr('font-size', '10px')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('transform', `translate(${x},${y}) rotate(-90)`)
      .text(text);
  
    if (isLeft) {
      this.leftYAxisGutterPx = Math.ceil(tickMaxW + padTicks + labelH + 4);
    }
  }

  /* ===== Адаптация входных данных ===== */

  private adaptInput(input: AnyHistogramResult | MonthlyUnitsRow[] | null, measure: MeasureKey): Adapted {
    if (!input) return { periods: [], resources: [], rows: [] };

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
    if (m === 'Budgeted')  return this.num(p.planned_qty);
    if (m === 'Actual')    return this.num(p.actual_qty);
    if (m === 'Remaining') return this.num(p.remaining_qty);
    return this.num(p.actual_qty) + this.num(p.remaining_qty);
  }
  private pickMeasureFromLegacyPoint(p: HistogramPointLegacy, m: MeasureKey): number {
    if (m === 'Budgeted')  return this.num(p.planned_qty);
    if (m === 'Actual')    return this.num(p.actual_qty);
    if (m === 'Remaining') return this.num(p.remaining_qty);
    return this.num(p.actual_qty) + this.num(p.remaining_qty);
  }
  private pickMeasureFromMonthly(u: MonthlyUnitsRow['units'][number] | undefined, m: MeasureKey): number {
    if (!u) return 0;
    if (m === 'Budgeted')  return this.num(u.Budgeted);
    if (m === 'Actual')    return this.num(u.Actual);
    if (m === 'Remaining') return this.num(u.Remaining);
    return this.num(u.AtCompletionUnits);
  }

  /* ===== Тоталы + лог ===== */

  private computeTotalsForAllMeasures(input: AnyHistogramResult | MonthlyUnitsRow[] | null): TotalsMap {
    const totals: TotalsMap = { Budgeted: 0, Actual: 0, Remaining: 0, AtCompletionUnits: 0 };
    if (!input) return totals;

    if (Array.isArray(input) && input.length > 0 && 'units' in input[0]) {
      for (const row of input as MonthlyUnitsRow[]) {
        for (const u of row.units) {
          totals.Budgeted += this.num(u.Budgeted);
          totals.Actual += this.num(u.Actual);
          totals.Remaining += this.num(u.Remaining);
          totals.AtCompletionUnits += this.num(u.AtCompletionUnits);
        }
      }
      return totals;
    }

    if (this.isNew(input)) {
      const resNew = input as HistogramResultNew;
      const overall = resNew.data?.[0];
      if (overall && Array.isArray(overall.points)) {
        for (const pt of overall.points) {
          totals.Budgeted += this.num(pt.planned_qty);
          totals.Actual += this.num(pt.actual_qty);
          totals.Remaining += this.num(pt.remaining_qty);
        }
        totals.AtCompletionUnits = totals.Actual + totals.Remaining;
        return totals;
      }
      for (const s of resNew.data ?? []) {
        for (const pt of s.points ?? []) {
          totals.Budgeted += this.num(pt.planned_qty);
          totals.Actual += this.num(pt.actual_qty);
          totals.Remaining += this.num(pt.remaining_qty);
        }
      }
      totals.AtCompletionUnits = totals.Actual + totals.Remaining;
      return totals;
    }

    if (this.isLegacy(input)) {
      const resLegacy = input as HistogramResultLegacy;
      const src = (resLegacy.overall && resLegacy.overall.length)
        ? resLegacy.overall
        : Object.values(resLegacy.byResource).flat();
      for (const pt of src) {
        totals.Budgeted += this.num(pt.planned_qty);
        totals.Actual += this.num(pt.actual_qty);
        totals.Remaining += this.num(pt.remaining_qty);
      }
      totals.AtCompletionUnits = totals.Actual + totals.Remaining;
      return totals;
    }

    return totals;
  }

  private num(x: any): number { const n = Number(x); return Number.isFinite(n) ? n : 0; }
  private fmt = (n: d3.NumberValue) => {
    const v = Number(n); const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + ' B';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + ' M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + ' K';
    return String(v);
  };

  private logTotals(totals: TotalsMap, selected: MeasureKey): void {
    try {
      const table = (['Budgeted','Actual','Remaining','AtCompletionUnits'] as MeasureKey[]).map(m => ({
        measure: m,
        total: totals[m],
        formatted: this.fmt(totals[m] as unknown as d3.NumberValue)
      }));
      // eslint-disable-next-line no-console
      console.group('[HistogramPivotChart] totals');
      if ((console as any).table) console.table(table);
      else console.log(table);
      // eslint-disable-next-line no-console
      console.log(`Selected (${selected}) total:`, totals[selected], 'formatted:', this.fmt(totals[selected] as unknown as d3.NumberValue));
      // eslint-disable-next-line no-console
      console.groupEnd();
    } catch {
      // eslint-disable-next-line no-console
      console.log('[HistogramPivotChart] totals:', totals);
    }
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

    const minLegend = 140, maxLegend = 240;
    this.legendW = Math.max(minLegend, Math.min(maxLegend, Math.floor(this.outerW * 0.22)));

    this.plotW = Math.max(0, this.outerW - this.legendW - this.legendPad);
    this.g.attr('transform', `translate(${this.margin.left},${this.margin.top})`);
    this.plotG.attr('transform', `translate(${this.legendW + this.legendPad},0)`);

    this.svg.attr('width', totalWidth).attr('height', totalHeight);
    this.sizeLegendHost();
  }

  private wrapWidth(): number {
    const el = this.wrapRef?.nativeElement as HTMLDivElement | undefined;
    return Math.max(0, el?.clientWidth ?? 0);
  }

  private rightYAxisLabelShiftPx = 8; 
  /** Сколько пикселей нужно справа под ось и подпись 'text' */
  private measureRightGutter(yRight: d3.ScaleLinear<number, number>, text: string): number {
    const padTicks = 8;   // отступ от тиков до подписи
    const extra     = 4;  // небольшой запас
  
    // ширина тиков
    const tmpAxis = this.plotG.append('g')
      .attr('opacity', 0)
      .attr('transform', `translate(${this.plotW},0)`);
    tmpAxis.call(d3.axisRight(yRight).ticks(6).tickFormat(this.fmt as any));
    const ticks = tmpAxis.selectAll<SVGTextElement, unknown>('text').nodes();
    const tickMaxW = ticks.length ? Math.max(...ticks.map(t => t.getBBox().width)) : 0;
    tmpAxis.remove();
  
    // ВЫСОТА подписи (вертикального текста)
    const tmpLabel = this.plotG.append('text')
      .attr('font-size', '10px')
      .attr('visibility', 'hidden')
      .text(text);
    const labelH = (tmpLabel.node() as SVGTextElement).getBBox().height;
    tmpLabel.remove();
  
    // добавили this.rightYAxisLabelShiftPx
    return Math.ceil(tickMaxW + padTicks + labelH + extra + this.rightYAxisLabelShiftPx);
  }
}
