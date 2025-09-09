import { P6Scalar } from "../parser.types";

function xmlNum(el: Element | null, tag: string): number | null {
  const s = xmlText(el, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function xmlText(el: Element | null, tag: string): string {
  if (!el) return '';
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() ?? '';
}

export function mapCurrencyToCurrtypeRow(cu: Element): Record<string, P6Scalar> | null {
  // PK (обязательный)
  const curr_id = xmlNum(cu, 'ObjectId');
  if (!Number.isFinite(curr_id as number)) {
    console.warn('[P6-XML] CURRTYPE пропущен (нет валидного ObjectId)', { curr_id });
    return null;
  }

  // Тексты
  const curr_type       = xmlText(cu, 'Name') || xmlText(cu, 'CurrencyName') || '';
  const curr_short_name = xmlText(cu, 'Id')   || xmlText(cu, 'ShortName')    || xmlText(cu, 'CurrencyId') || '';
  const curr_symbol     = xmlText(cu, 'Symbol') || xmlText(cu, 'CurrencySymbol') || '';

  // Числа / параметры форматирования
  const base_exch_rate     = xmlNum(cu, 'BaseExchRate') ?? xmlNum(cu, 'ExchangeRate') ?? xmlNum(cu, 'BaseExchangeRate');
  const decimal_digit_cnt  = xmlNum(cu, 'DecimalPlaces') ?? xmlNum(cu, 'DigitsAfterDecimal');
  const decimal_symbol     = xmlText(cu, 'DecimalSymbol') || '';
  const digit_group_symbol = xmlText(cu, 'DigitGroupingSymbol') || xmlText(cu, 'DigitGroupSymbol') || '';
  const group_digit_cnt    = xmlNum(cu, 'GroupDigitCount') ?? xmlNum(cu, 'CurrencyGroupDigitCnt');

  // Позитив/негатив формат — могут быть строками-примерами или кодами
  const neg_fmt_num = xmlNum(cu, 'NegativeCurrencyFormatType');
  const pos_fmt_num = xmlNum(cu, 'PositiveCurrencyFormatType');
  const neg_fmt_txt = xmlText(cu, 'NegativeSymbol') || xmlText(cu, 'NegativeCurrencyFormat') || '';
  const pos_fmt_txt = xmlText(cu, 'PositiveSymbol') || xmlText(cu, 'PositiveCurrencyFormat') || '';

  const neg_curr_fmt_type: string | number | null =
    Number.isFinite(neg_fmt_num as number) ? (neg_fmt_num as number) : (neg_fmt_txt || null);
  const pos_curr_fmt_type: string | number | null =
    Number.isFinite(pos_fmt_num as number) ? (pos_fmt_num as number) : (pos_fmt_txt || null);

  return {
    curr_id: curr_id as number,
    curr_type: curr_type || null,
    curr_short_name: curr_short_name || null,
    curr_symbol: curr_symbol || null,

    base_exch_rate: base_exch_rate ?? null,

    decimal_digit_cnt: decimal_digit_cnt ?? null,
    decimal_symbol: decimal_symbol || null,
    digit_group_symbol: digit_group_symbol || null,
    group_digit_cnt: group_digit_cnt ?? null,

    neg_curr_fmt_type,
    pos_curr_fmt_type,
  };
}
