/**
 * Per-user daily limits for AI requests. Plain TypeScript with no runtime
 * imports (shared by the edge function and Vitest). The counting itself is
 * done atomically in the database (kaiwriter_ai_reserve / kaiwriter_ai_finish).
 */

export type Plan = 'free' | 'pro' | 'teams';

export interface DailyLimits {
  free: number;
  pro: number;
  teams: number;
}

/** Defaults until the owner sets WRITING_ASSIST_DAILY_LIMIT_{FREE,PRO,TEAMS}. */
export const DEFAULT_DAILY_LIMITS: DailyLimits = { free: 25, pro: 500, teams: 500 };
const MAX_LIMIT = 100_000;

function parseLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_LIMIT ? n : fallback;
}

/** Limits from the environment. Invalid values fall back to the default; 0 turns AI off for that plan. */
export function parseDailyLimits(env: (name: string) => string | undefined): DailyLimits {
  return {
    free: parseLimit(env('WRITING_ASSIST_DAILY_LIMIT_FREE'), DEFAULT_DAILY_LIMITS.free),
    pro: parseLimit(env('WRITING_ASSIST_DAILY_LIMIT_PRO'), DEFAULT_DAILY_LIMITS.pro),
    teams: parseLimit(env('WRITING_ASSIST_DAILY_LIMIT_TEAMS'), DEFAULT_DAILY_LIMITS.teams),
  };
}

/** The plan that applies: a paid plan only while its subscription is active or trialing. */
export function effectivePlan(row: { plan?: unknown; status?: unknown } | null | undefined): Plan {
  if (!row) return 'free';
  const active = row.status === 'active' || row.status === 'trialing';
  return active && (row.plan === 'pro' || row.plan === 'teams') ? row.plan : 'free';
}

/** Usage is counted per UTC day. */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface QuotaInfo {
  limit: number;
  remaining: number;
}

/**
 * Interpret kaiwriter_ai_reserve's result: the number of requests used today
 * including this one, or -1 if the limit was already reached.
 */
export function quotaAfterReserve(used: unknown, limit: number): QuotaInfo | null {
  const n = Number(used);
  if (!Number.isInteger(n) || n < 0) return null;
  return { limit, remaining: Math.max(0, limit - n) };
}
