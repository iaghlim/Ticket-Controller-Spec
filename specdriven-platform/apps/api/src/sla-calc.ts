/**
 * Cálculo de SLA em horas úteis (Fase E + Sprint 4 feriados).
 * Dias configuráveis + janela [businessHourStart, businessHourEnd).
 */
import {
  DEFAULT_BUSINESS_HOURS,
  type DefaultBusinessHours,
} from "@specdriven/shared";

export type BusinessHoursConfig = {
  businessHourStart: number;
  businessHourEnd: number;
  /** ISO weekdays 1=Mon … 7=Sun */
  weekdays: number[];
  /** Datas YYYY-MM-DD sem hora útil */
  holidays?: ReadonlySet<string>;
};

const WEEKDAY_LABELS_PT: Record<number, string> = {
  1: "seg",
  2: "ter",
  3: "qua",
  4: "qui",
  5: "sex",
  6: "sáb",
  7: "dom",
};

function parseWeekdays(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

export function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isHoliday(d: Date, holidays?: ReadonlySet<string>): boolean {
  if (!holidays?.size) return false;
  return holidays.has(dateKeyLocal(d));
}

export function parseDefaultBusinessHoursJson(
  json: string | null | undefined,
): DefaultBusinessHours {
  if (!json?.trim()) return { ...DEFAULT_BUSINESS_HOURS };
  try {
    const raw = JSON.parse(json) as Partial<DefaultBusinessHours>;
    const start = raw.businessHourStart ?? DEFAULT_BUSINESS_HOURS.businessHourStart;
    const end = raw.businessHourEnd ?? DEFAULT_BUSINESS_HOURS.businessHourEnd;
    const weekdays = raw.weekdays?.trim() || DEFAULT_BUSINESS_HOURS.weekdays;
    if (start >= end) return { ...DEFAULT_BUSINESS_HOURS };
    return {
      businessHourStart: start,
      businessHourEnd: end,
      weekdays,
    };
  } catch {
    return { ...DEFAULT_BUSINESS_HOURS };
  }
}

export function serializeDefaultBusinessHours(
  hours: DefaultBusinessHours,
): string {
  return JSON.stringify(hours);
}

export function businessHoursFromTemplate(
  template: DefaultBusinessHours,
  holidays?: ReadonlySet<string>,
): BusinessHoursConfig {
  const weekdays = parseWeekdays(template.weekdays);
  return {
    businessHourStart: template.businessHourStart,
    businessHourEnd: template.businessHourEnd,
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5],
    holidays,
  };
}

export function businessHoursFromPolicy(
  policy: {
    businessHourStart: number;
    businessHourEnd: number;
    weekdays: string;
  },
  holidays?: ReadonlySet<string>,
): BusinessHoursConfig {
  const weekdays = parseWeekdays(policy.weekdays);
  return {
    businessHourStart: policy.businessHourStart,
    businessHourEnd: policy.businessHourEnd,
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5],
    holidays,
  };
}

/** Resumo legível em PT-BR para o portal cliente. */
export function formatBusinessHoursSummaryPtBr(
  template: DefaultBusinessHours,
): string {
  const weekdays = parseWeekdays(template.weekdays);
  const dayPart =
    weekdays.length === 5 &&
    weekdays.every((d, i) => d === i + 1)
      ? "seg–sex"
      : weekdays.map((d) => WEEKDAY_LABELS_PT[d] ?? String(d)).join(", ");
  return `Horário comercial: ${dayPart}, ${template.businessHourStart}h–${template.businessHourEnd}h`;
}

/** ISO weekday 1=Mon … 7=Sun (JS getDay: 0=Sun). */
function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function isBusinessInstant(d: Date, cfg: BusinessHoursConfig): boolean {
  if (isHoliday(d, cfg.holidays)) return false;
  if (!cfg.weekdays.includes(isoWeekday(d))) return false;
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return h >= cfg.businessHourStart && h < cfg.businessHourEnd;
}

function nextBusinessStart(from: Date, cfg: BusinessHoursConfig): Date {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  for (let i = 0; i < 14 * 24 * 60; i++) {
    if (isBusinessInstant(d, cfg)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return d;
}

/**
 * Soma `minutes` de tempo útil a partir de `from`.
 */
export function addBusinessMinutes(
  from: Date,
  minutes: number,
  cfg: BusinessHoursConfig,
): Date {
  if (minutes <= 0) return new Date(from.getTime());
  let remaining = minutes;
  let cursor = nextBusinessStart(from, cfg);

  while (remaining > 0) {
    if (!isBusinessInstant(cursor, cfg)) {
      cursor = nextBusinessStart(cursor, cfg);
      continue;
    }
    const endOfDay = new Date(cursor);
    endOfDay.setHours(cfg.businessHourEnd, 0, 0, 0);
    const available = Math.max(
      0,
      Math.floor((endOfDay.getTime() - cursor.getTime()) / 60_000),
    );
    if (available <= 0) {
      cursor = nextBusinessStart(new Date(cursor.getTime() + 60_000), cfg);
      continue;
    }
    if (remaining <= available) {
      return new Date(cursor.getTime() + remaining * 60_000);
    }
    remaining -= available;
    cursor = nextBusinessStart(new Date(endOfDay.getTime() + 60_000), cfg);
  }
  return cursor;
}

/**
 * Conta minutos úteis entre `from` e `to` (to exclusive se fora da janela).
 */
export function countBusinessMinutes(
  from: Date,
  to: Date,
  cfg: BusinessHoursConfig,
): number {
  if (to <= from) return 0;
  let count = 0;
  let cursor = nextBusinessStart(from, cfg);
  const limit = to.getTime();

  while (cursor.getTime() < limit) {
    if (!isBusinessInstant(cursor, cfg)) {
      cursor = nextBusinessStart(cursor, cfg);
      if (cursor.getTime() >= limit) break;
      continue;
    }
    const endOfDay = new Date(cursor);
    endOfDay.setHours(cfg.businessHourEnd, 0, 0, 0);
    const sliceEnd = Math.min(endOfDay.getTime(), limit);
    count += Math.max(0, Math.floor((sliceEnd - cursor.getTime()) / 60_000));
    cursor = nextBusinessStart(new Date(endOfDay.getTime() + 60_000), cfg);
  }
  return count;
}
