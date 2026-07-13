/**
 * Cálculo de SLA em horas úteis (Fase E).
 * Dias configuráveis + janela [businessHourStart, businessHourEnd).
 */
export type BusinessHoursConfig = {
  businessHourStart: number;
  businessHourEnd: number;
  /** ISO weekdays 1=Mon … 7=Sun */
  weekdays: number[];
};

function parseWeekdays(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

export function businessHoursFromPolicy(policy: {
  businessHourStart: number;
  businessHourEnd: number;
  weekdays: string;
}): BusinessHoursConfig {
  const weekdays = parseWeekdays(policy.weekdays);
  return {
    businessHourStart: policy.businessHourStart,
    businessHourEnd: policy.businessHourEnd,
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5],
  };
}

/** ISO weekday 1=Mon … 7=Sun (JS getDay: 0=Sun). */
function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function isBusinessInstant(d: Date, cfg: BusinessHoursConfig): boolean {
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
