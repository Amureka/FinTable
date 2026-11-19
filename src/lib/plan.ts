// Расчёт плана накоплений. Чистые функции без зависимостей, покрыты тестами.
// Суммы — целые рубли. Месяц — { year, month }, month от 1 до 12.

export interface MonthRef {
  year: number;
  month: number;
}

export interface PlanItem {
  month: string; // "yyyy-MM"
  plannedAmount: number;
}

export const MAX_PLAN_MONTHS = 120;

export type PlanResult =
  | {
      ok: true;
      monthly: number;
      months: number;
      endMonth: MonthRef;
      plan: PlanItem[];
      // взнос был больше цели и ограничен суммой цели
      cappedToTarget: boolean;
    }
  | { ok: false; error: string };

export function monthKey(ref: MonthRef): string {
  return `${ref.year}-${String(ref.month).padStart(2, "0")}`;
}

export function addMonths(ref: MonthRef, count: number): MonthRef {
  // Работаем с индексом месяца, а не с датой, чтобы 31-е число не ломало расчёт
  const index = ref.year * 12 + (ref.month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// Число месяцев от start до end включительно. Если end раньше start — 0 или меньше.
export function monthsInclusive(start: MonthRef, end: MonthRef): number {
  return (end.year - start.year) * 12 + (end.month - start.month) + 1;
}

// Собирает план из целевой суммы и взноса: последний месяц получает остаток
function buildPlan(target: number, start: MonthRef, monthlyInput: number): PlanResult {
  const cappedToTarget = monthlyInput > target;
  const monthly = cappedToTarget ? target : monthlyInput;
  const months = Math.ceil(target / monthly);

  if (months > MAX_PLAN_MONTHS) {
    return {
      ok: false,
      error: `Срок получается больше ${MAX_PLAN_MONTHS} месяцев. Увеличьте сумму в месяц.`
    };
  }

  const plan: PlanItem[] = [];
  for (let i = 0; i < months; i++) {
    const isLast = i === months - 1;
    plan.push({
      month: monthKey(addMonths(start, i)),
      plannedAmount: isLast ? target - monthly * (months - 1) : monthly
    });
  }

  return {
    ok: true,
    monthly,
    months,
    endMonth: addMonths(start, months - 1),
    plan,
    cappedToTarget
  };
}

function validateTarget(target: number): string | null {
  if (!Number.isFinite(target) || target <= 0) return "Введите целевую сумму больше нуля";
  if (!Number.isInteger(target)) return "Целевая сумма должна быть в целых рублях";
  return null;
}

// Задан месяц окончания -> считаем сумму в месяц
export function planFromEndMonth(target: number, start: MonthRef, end: MonthRef): PlanResult {
  const targetError = validateTarget(target);
  if (targetError) return { ok: false, error: targetError };

  const months = monthsInclusive(start, end);
  if (months < 1) return { ok: false, error: "Месяц окончания не может быть раньше текущего" };
  if (months > MAX_PLAN_MONTHS) {
    return { ok: false, error: `Срок не может быть больше ${MAX_PLAN_MONTHS} месяцев` };
  }

  return buildPlan(target, start, Math.ceil(target / months));
}

// Задана сумма в месяц -> считаем месяц окончания
export function planFromMonthly(target: number, start: MonthRef, monthly: number): PlanResult {
  const targetError = validateTarget(target);
  if (targetError) return { ok: false, error: targetError };

  if (!Number.isFinite(monthly) || monthly <= 0) {
    return { ok: false, error: "Сумма в месяц должна быть больше нуля" };
  }
  if (!Number.isInteger(monthly)) {
    return { ok: false, error: "Сумма в месяц должна быть в целых рублях" };
  }

  return buildPlan(target, start, monthly);
}
