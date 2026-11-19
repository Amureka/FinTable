// Разлив внесённой суммы по целям и подушке безопасности. Чистые функции, покрыты тестами.
//
// Правила:
// 1. Цели, в которых пользователь задал сумму вручную («закреплённые»), получают ровно её.
// 2. Остальные цели получают «нужно внести» (план месяца минус уже внесённое), начиная с цели
//    с ближайшим сроком окончания. Если денег не хватает, достаётся тем, у кого срок раньше.
// 3. Излишек распределяется на незакреплённые цели с ближайшим сроком, каждая берёт не больше
//    остатка до своей цели.
// 4. Всё, что осталось, уходит в подушку безопасности. Нераспределённого остатка не бывает.
// 5. Если вручную распределено больше (или меньше, когда подушка тоже закреплена), чем введено,
//    вносимая сумма пересчитывается.

export const CUSHION_ID = "cushion";

export interface DistributionGoal {
  id: string;
  // сколько нужно внести сейчас: план месяца минус уже внесённое, не меньше нуля
  need: number;
  // сколько осталось до целевой суммы
  remaining: number;
  // месяц окончания "yyyy-MM", по нему определяется очерёдность
  endMonth: string;
}

export interface DistributionInput {
  amount: number;
  goals: DistributionGoal[];
  // суммы, заданные пользователем вручную: id цели (или CUSHION_ID) -> сумма
  locked: Record<string, number>;
}

export interface DistributionResult {
  // итоговая сумма по каждой цели; ключ CUSHION_ID — подушка
  values: Record<string, number>;
  // какая часть суммы цели пришла по плану и какая сверх плана (для подсказок в интерфейсе)
  planPart: Record<string, number>;
  surplusPart: Record<string, number>;
  // сумма внесения с учётом ручных правок
  effectiveAmount: number;
  amountAdjusted: boolean;
}

function byEndMonth(a: DistributionGoal, b: DistributionGoal): number {
  if (a.endMonth !== b.endMonth) return a.endMonth < b.endMonth ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function distribute(input: DistributionInput): DistributionResult {
  const { goals, locked } = input;
  const amount = Math.max(input.amount || 0, 0);

  const lockedGoalIds = goals.filter(goal => goal.id in locked).map(goal => goal.id);
  const cushionLocked = CUSHION_ID in locked;

  const lockedSum =
    lockedGoalIds.reduce((sum, id) => sum + locked[id], 0) + (cushionLocked ? locked[CUSHION_ID] : 0);

  const autoGoals = goals.filter(goal => !(goal.id in locked)).sort(byEndMonth);

  const values: Record<string, number> = {};
  const planPart: Record<string, number> = {};
  const surplusPart: Record<string, number> = {};

  lockedGoalIds.forEach(id => {
    values[id] = locked[id];
    planPart[id] = 0;
    surplusPart[id] = 0;
  });

  let free = amount - lockedSum;
  let effectiveAmount = amount;

  if (free < 0) {
    // вручную распределено больше, чем введено: сумма внесения растёт
    effectiveAmount = lockedSum;
    free = 0;
  }

  // Шаг 1: по плану, у ближайшего срока приоритет
  autoGoals.forEach(goal => {
    const give = Math.min(Math.min(goal.need, goal.remaining), free);
    planPart[goal.id] = give;
    surplusPart[goal.id] = 0;
    free -= give;
  });

  // Шаг 2: излишек на цели с ближайшим сроком, не больше остатка до цели
  autoGoals.forEach(goal => {
    const room = Math.max(goal.remaining - planPart[goal.id], 0);
    const give = Math.min(room, free);
    surplusPart[goal.id] = give;
    free -= give;
  });

  autoGoals.forEach(goal => {
    values[goal.id] = planPart[goal.id] + surplusPart[goal.id];
  });

  // Шаг 3: остаток в подушку, если она не закреплена вручную
  if (cushionLocked) {
    values[CUSHION_ID] = locked[CUSHION_ID];
    if (free > 0) {
      // распределять некуда: сумма внесения уменьшается
      effectiveAmount = amount - free;
    }
  } else {
    values[CUSHION_ID] = free;
  }
  planPart[CUSHION_ID] = 0;
  surplusPart[CUSHION_ID] = values[CUSHION_ID];

  return {
    values,
    planPart,
    surplusPart,
    effectiveAmount,
    amountAdjusted: effectiveAmount !== amount
  };
}

// Куда предложить перенести оверкап (лишнее сверх остатка цели): на незакрытую цель с ближайшим
// сроком, у которой после переноса не будет перебора, иначе в подушку.
export function suggestOvercapTarget(
  fromId: string,
  goals: DistributionGoal[],
  values: Record<string, number>
): string {
  const candidates = goals
    .filter(goal => goal.id !== fromId && goal.remaining - (values[goal.id] ?? 0) > 0)
    .sort(byEndMonth);

  return candidates.length > 0 ? candidates[0].id : CUSHION_ID;
}
