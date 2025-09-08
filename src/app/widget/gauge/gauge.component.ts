
import {
  Component, Input, OnDestroy, AfterViewInit,
  ElementRef, ViewChild
} from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import * as d3 from 'd3';

export interface GaugeConfig {
  min: number;
  max: number;
  value: number;
  size: number;
  zones: { from: number; to: number; color: string }[];
}

@Component({
  selector: 'd3js-speedometer',
  template: `<div #chart></div>`,
  styleUrls: ['./gauge.component.scss']
})
export class SpeedometerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chart', { static: true }) private chartContainer!: ElementRef;
  @Input() config$!: Observable<GaugeConfig>;

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private pointerGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private valueText!: d3.Selection<SVGTextElement, unknown, null, undefined>;
  private configSub?: Subscription;
  private config?: GaugeConfig;
  private lastZones?: string;
  private lastSize?: number;

  ngAfterViewInit(): void {
    this.configSub = this.config$.subscribe(cfg => {
      // 1. Проверяем, что пришёл валидный config
      if (!this.isValidConfig(cfg)) return;
      // 2. Надо ли полностью пересоздавать график?
      const zonesChanged = JSON.stringify(cfg.zones) !== this.lastZones;
      const sizeChanged = cfg.size !== this.lastSize;
      this.config = cfg;
      if (!this.svg || zonesChanged || sizeChanged) {
        this.createSvg();
        this.drawStaticParts();
        this.lastZones = JSON.stringify(cfg.zones);
        this.lastSize = cfg.size;
      }
      this.updateDynamicParts();
    });
  }

  ngOnDestroy(): void {
    this.configSub?.unsubscribe();
  }

  /** Проверка, что config валиден и все обязательные поля присутствуют */
  private isValidConfig(config: any): config is GaugeConfig {
    return !!config
      && typeof config.min === 'number'
      && typeof config.max === 'number'
      && typeof config.value === 'number'
      && typeof config.size === 'number'
      && Array.isArray(config.zones);
  }

  /** Создаёт пустой SVG, полностью очищая контейнер */
  private createSvg(): void {
    if (!this.isValidConfig(this.config)) return;
    d3.select(this.chartContainer.nativeElement).select('svg').remove();
    this.svg = d3.select(this.chartContainer.nativeElement)
      .append('svg')
      .attr('width', this.config.size)
      .attr('height', this.config.size / 2 + 40);
  }

  /** Рисует все статичные элементы — зоны, фон, стрелку, текст (без значения) */
  private drawStaticParts(): void {
    const { min, max, size, zones } = this.config!;
    const width = size;
    const height = size / 2 + 40;
    const radius = size / 2;
    const centerX = width / 2;
    const centerY = radius;
    const startAngle = -Math.PI / 2;
    const endAngle = Math.PI / 2;
    const angleScale = d3.scaleLinear()
      .domain([min, max])
      .range([startAngle, endAngle]);

    // Цветные зоны
    const gZones = this.svg.append('g').attr('transform', `translate(${centerX},${centerY})`);
    const zoneArc = d3.arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(radius * 0.7)
      .outerRadius(radius * 0.9);
    gZones.selectAll('path')
      .data(zones)
      .enter()
      .append('path')
      .attr('d', d => zoneArc({
        startAngle: angleScale(d.from),
        endAngle: angleScale(d.to)
      })!)
      .attr('fill', d => d.color);

    // Фоновая шкала
    const gScale = this.svg.append('g').attr('transform', `translate(${centerX},${centerY})`);
    const bgArc = d3.arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(radius * 0.65)
      .outerRadius(radius * 0.65 + 2);
    gScale.append('path')
      .attr('d', bgArc({ startAngle, endAngle })!)
      .attr('fill', '#ccc');

    // Группа для стрелки (запоминаем ссылку)
    this.pointerGroup = this.svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`)
      .append('g')
      .attr('class', 'pointer');
    const pointerLen = radius * 0.65;
    const pointerWidth = 6;
    const pointerLine = d3.line<[number, number]>()
      .x(d => d[0])
      .y(d => d[1]);
    const pts: [number, number][] = [
      [0, -pointerWidth / 2],
      [pointerLen, 0],
      [0, pointerWidth / 2]
    ];
    this.pointerGroup.append('path')
      .attr('d', pointerLine(pts)!)
      .attr('fill', '#000');
    this.pointerGroup.append('circle')
      .attr('r', 8)
      .attr('fill', '#000');

    // Текстовое значение (запоминаем ссылку)
    this.valueText = this.svg.append('text')
      .attr('x', centerX)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-family', 'sans-serif');
  }

  /** Обновляет только стрелку и текст значения */
  private updateDynamicParts(): void {
    const { min, max, value } = this.config!;
    const startAngle = -Math.PI / 2;
    const endAngle = Math.PI / 2;
    const angleScale = d3.scaleLinear()
      .domain([min, max])
       .range([startAngle, endAngle]);

      
    const theta = angleScale(value > 1 ? 1 : value) - Math.PI/2;
    const degree = theta * 180 / Math.PI;
    // Анимация стрелки
    this.pointerGroup
      .transition().duration(350)
      .attr('transform', `rotate(${degree})`);
    // Текст значения
    this.valueText.text(value.toFixed(2));
  }
}