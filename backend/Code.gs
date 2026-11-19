// =====================================================================
// FinTable — серверная часть (Google Apps Script)
// Колонки на листах определяются по ЗАГОЛОВКАМ первой строки, а не по
// номерам, поэтому порядок колонок на листе не важен.
// =====================================================================

// =========================
// Настройки листов
// =========================

const GOALS_SHEET_NAME = "Goals";
const GOAL_PLAN_SHEET_NAME = "GoalPlan";
const GOAL_DEPOSITS_SHEET_NAME = "GoalDeposits";
const DEPOSITS_SHEET_NAME = "Deposits";
// Настройки бюджета: доход и базовые расходы, действуют с указанного месяца
const BUDGET_SETTINGS_SHEET_NAME = "BudgetSettings";
// Фактический доход, полученный в конкретном месяце
const MONTH_INCOME_SHEET_NAME = "MonthIncome";
// Переносы денег между целями и списания (потрачено)
const TRANSFERS_SHEET_NAME = "Transfers";

// Обязательные заголовки каждого листа (названия должны совпадать)
const SHEET_HEADERS = {
  [GOALS_SHEET_NAME]: [
    "id", "name", "currentAmount", "targetAmount", "monthStart",
    "monthEnd", "monthlyAmount", "status", "createdAt"
  ],
  [GOAL_PLAN_SHEET_NAME]: ["goalId", "month", "plannedAmount"],
  [GOAL_DEPOSITS_SHEET_NAME]: ["goalId", "month", "actualAmount"],
  [DEPOSITS_SHEET_NAME]: ["month", "amount"],
  [BUDGET_SETTINGS_SHEET_NAME]: ["effectiveFrom", "monthlyIncome", "baseExpenses"],
  [MONTH_INCOME_SHEET_NAME]: ["month", "actualIncome"],
  // type: "transfer" (toId заполнен) или "writeoff" (toId пустой)
  [TRANSFERS_SHEET_NAME]: ["month", "fromId", "toId", "amount", "type"]
};

// Необязательные колонки: если их нет на листе, они добавляются автоматически
const OPTIONAL_HEADERS = {
  // repeatMonths — через сколько месяцев цель повторяется (страховка, налог); пусто — не повторяется
  [GOALS_SHEET_NAME]: ["repeatMonths"]
};

// Эти листы создаются автоматически, если их нет в таблице
const AUTO_CREATED_SHEETS = [BUDGET_SETTINGS_SHEET_NAME, MONTH_INCOME_SHEET_NAME, TRANSFERS_SHEET_NAME];

const GOAL_STATUS_ACTIVE = "Активна";
const GOAL_STATUS_COMPLETED = "Выполнена";
const GOAL_STATUS_DELETED = "Удалена";
// Какие значения в колонке status считаются «активна»
const ACTIVE_STATUS_VALUES = ["Активна", "active"];

const MONEY_EPSILON = 0.005;

// Подушка безопасности: «цель» без срока и суммы. В листе Goals строки нет,
// взносы на неё пишутся в GoalDeposits с этим goalId.
const CUSHION_GOAL_ID = "cushion";

// =========================
// GET запросы
// =========================

function doGet(e) {
  const parameters = (e && e.parameter) ? e.parameter : {};

  try {
    return jsonResponse(runAction_(parameters.action, parameters));
  } catch (error) {
    return jsonResponse({ success: false, error: String(error.message || error) });
  }
}

// =========================
// POST запросы
// =========================

function doPost(e) {
  let requestData;

  try {
    requestData = e.parameter && e.parameter.data
      ? JSON.parse(e.parameter.data)
      : JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse({ success: false, error: "Некорректный запрос: " + error });
  }

  try {
    return jsonResponse(runAction_(requestData.action, requestData));
  } catch (error) {
    return jsonResponse({ success: false, error: String(error.message || error) });
  }
}

// Общая точка входа для GET и POST
function runAction_(action, data) {
  switch (action) {
    case "goals":
    case "getGoals":
      return getGoals();

    case "plan":
    case "getPlan":
      return getPlan();

    case "createGoal":
      return withLock_(() => createGoal(data));

    case "getDepositPreview":
      return getDepositPreview(data.month);

    case "getDepositSummary":
      return getDepositSummary(data.month);

    case "getCushion":
      return { amount: sumBalanceByGoal_()[CUSHION_GOAL_ID] || 0 };

    case "updateGoal":
      return withLock_(() => updateGoal(data));

    case "deleteGoal":
      return withLock_(() => deleteGoal(data));

    case "transferMoney":
      return withLock_(() => transferMoney(data));

    case "saveDeposit":
      return withLock_(() => saveDeposit(data));

    case "getBudgetOverview":
      return getBudgetOverview(data.months);

    case "getMonthTable":
      return getMonthTable();

    case "saveBudgetSettings":
      return withLock_(() => saveBudgetSettings(data));

    case "saveMonthIncome":
      return withLock_(() => saveMonthIncome(data));

    default:
      return { success: false, message: "Unknown action" };
  }
}

// =========================
// Цели
// =========================

function getGoals() {
  const goals = readGoals_().filter(goal => String(goal.status).trim() !== GOAL_STATUS_DELETED);
  const depositedByGoal = sumBalanceByGoal_();

  return goals.map(goal => ({
    id: goal.id,
    name: goal.name,
    // Считаем из GoalDeposits — не зависит от формулы в таблице
    currentAmount: depositedByGoal[String(goal.id)] || 0,
    targetAmount: Number(goal.targetAmount) || 0,
    monthStart: normalizeMonth_(goal.monthStart),
    monthEnd: normalizeMonth_(goal.monthEnd),
    monthlyAmount: Number(goal.monthlyAmount) || 0,
    status: goal.status,
    createdAt: goal.createdAt,
    repeatMonths: Number(goal.repeatMonths) || 0
  }));
}

function createGoal(data) {
  const name = String(data.name || "").trim();
  const targetAmount = Number(data.targetAmount);

  if (!name) {
    throw new Error("Укажите название цели");
  }
  if (!isFinite(targetAmount) || targetAmount <= 0) {
    throw new Error("Целевая сумма должна быть больше нуля");
  }
  if (!Array.isArray(data.plan) || data.plan.length === 0) {
    throw new Error("План накоплений пуст");
  }

  const goalId = new Date().getTime();

  const repeatMonths = Number(data.repeatMonths) || 0;
  if (repeatMonths < 0 || repeatMonths > 120 || repeatMonths !== Math.floor(repeatMonths)) {
    throw new Error("Период повтора должен быть целым числом месяцев от 1 до 120");
  }

  const goalRow = {
    id: goalId,
    name: name,
    targetAmount: targetAmount,
    monthStart: data.monthStart,
    monthEnd: data.monthEnd,
    monthlyAmount: data.monthlyAmount,
    status: GOAL_STATUS_ACTIVE,
    createdAt: data.createdAt
  };
  if (repeatMonths > 0) goalRow.repeatMonths = repeatMonths;

  // currentAmount не записываем: колонка может считаться формулой таблицы
  writeRows_(GOALS_SHEET_NAME, [goalRow]);

  writeRows_(GOAL_PLAN_SHEET_NAME, data.plan.map(planItem => ({
    goalId: goalId,
    month: planItem.month,
    plannedAmount: planItem.plannedAmount
  })));

  return { success: true, id: goalId };
}

// =========================
// План
// =========================

function getPlan() {
  return readPlanRows_().map(planRow => ({
    goalId: planRow.goalId,
    month: planRow.month,
    plannedAmount: planRow.plannedAmount
  }));
}

// =========================
// Внесение денег: превью
// =========================

// Данные для окна «Внести деньги»: активные цели и подушка безопасности.
// Возвращает { goals: [...], cushion: {...} }
function getDepositPreview(requestedMonth) {
  const currentMonth = getMonthKey_(requestedMonth);
  const previousMonths = [-3, -2, -1].map(shift => shiftMonth_(currentMonth, shift));

  const plans = readPlanRows_();
  const goalDeposits = readGoalDepositRows_();
  const depositedByGoal = sumBalanceByGoal_();

  const depositedInMonth = (goalId, month) => goalDeposits
    .filter(d => String(d.goalId) === String(goalId) && d.month === month)
    .reduce((sum, d) => sum + d.actualAmount, 0);

  const previousMonthsDeposits = goalId => previousMonths.map(month => ({
    month: month,
    amount: depositedInMonth(goalId, month)
  }));

  const goals = readGoals_()
    .filter(isGoalActive_)
    .map(goal => {
      const goalId = String(goal.id);

      const plannedAmount = plans
        .filter(p => String(p.goalId) === goalId && p.month === currentMonth)
        .reduce((sum, p) => sum + p.plannedAmount, 0);

      const targetAmount = Number(goal.targetAmount) || 0;
      const currentAmount = depositedByGoal[goalId] || 0;

      return {
        goalId: goal.id,
        name: goal.name,
        targetAmount: targetAmount,
        currentAmount: currentAmount,
        remainingAmount: Math.max(targetAmount - currentAmount, 0),
        monthEnd: normalizeMonth_(goal.monthEnd),
        plannedAmount: plannedAmount,
        currentMonthDeposits: depositedInMonth(goalId, currentMonth),
        previousMonthsDeposits: previousMonthsDeposits(goalId)
      };
    });

  return {
    goals: goals,
    cushion: {
      goalId: CUSHION_GOAL_ID,
      currentAmount: depositedByGoal[CUSHION_GOAL_ID] || 0,
      currentMonthDeposits: depositedInMonth(CUSHION_GOAL_ID, currentMonth),
      previousMonthsDeposits: previousMonthsDeposits(CUSHION_GOAL_ID)
    }
  };
}

// Итоги месяца: сколько нужно внести по плану и сколько уже внесено
function getDepositSummary(requestedMonth) {
  const currentMonth = getMonthKey_(requestedMonth);

  const activeGoalIds = readGoals_()
    .filter(isGoalActive_)
    .map(goal => String(goal.id));

  const totalPlanned = readPlanRows_()
    .filter(p => p.month === currentMonth && activeGoalIds.indexOf(String(p.goalId)) !== -1)
    .reduce((sum, p) => sum + p.plannedAmount, 0);

  const totalDeposited = readDepositRows_()
    .filter(d => d.month === currentMonth)
    .reduce((sum, d) => sum + d.amount, 0);

  return {
    month: currentMonth,
    totalPlanned: totalPlanned,
    totalDeposited: totalDeposited
  };
}

// =========================
// Внесение денег: сохранение
// =========================

// data: { month, amount, allocations: [{ goalId, actualAmount }] }
// Вся внесённая сумма должна быть распределена: на цели и/или в подушку безопасности.
// Вносить больше остатка до цели можно (оверкап), решение о переносе лишнего принимает пользователь.
function saveDeposit(data) {
  const month = getMonthKey_(data.month);
  const depositAmount = Number(data.amount);

  if (!isFinite(depositAmount) || depositAmount <= 0) {
    throw new Error("Сумма внесения должна быть больше нуля");
  }
  if (!Array.isArray(data.allocations)) {
    throw new Error("Не передано распределение по целям");
  }

  const allocations = data.allocations
    .map(a => ({ goalId: a.goalId, actualAmount: Number(a.actualAmount) }))
    .filter(a => a.actualAmount !== 0);

  allocations.forEach(a => {
    if (!isFinite(a.actualAmount) || a.actualAmount < 0) {
      throw new Error("Сумма по цели не может быть отрицательной");
    }
  });

  if (allocations.length === 0) {
    throw new Error("Распределите деньги хотя бы на одну цель");
  }

  const allocatedTotal = allocations.reduce((sum, a) => sum + a.actualAmount, 0);
  if (Math.abs(allocatedTotal - depositAmount) > MONEY_EPSILON) {
    throw new Error("Сумма распределения (" + allocatedTotal + ") должна равняться внесённой сумме (" + depositAmount + ")");
  }

  // Цели должны существовать и быть активными (подушка существует всегда)
  const goals = readGoals_();
  const goalDepositsBefore = readGoalDepositRows_();
  const depositedByGoal = sumBalanceByGoal_();

  allocations.forEach(a => {
    if (String(a.goalId) === CUSHION_GOAL_ID) return;

    const goal = goals.filter(g => String(g.id) === String(a.goalId))[0];

    if (!goal) {
      throw new Error("Цель не найдена: " + a.goalId);
    }
    if (!isGoalActive_(goal)) {
      throw new Error("Цель «" + goal.name + "» уже закрыта — вносить на неё нельзя");
    }
  });

  // Запись: общий взнос и распределение
  writeRows_(DEPOSITS_SHEET_NAME, [{ month: month, amount: depositAmount }]);

  writeRows_(GOAL_DEPOSITS_SHEET_NAME, allocations.map(a => ({
    goalId: a.goalId,
    month: month,
    actualAmount: a.actualAmount
  })));

  // Закрываем цели, достигшие целевой суммы, и пересчитываем будущий план остальных
  const completedGoalIds = [];
  const replannedGoalIds = [];
  const plans = readPlanRows_();

  goals.filter(isGoalActive_).forEach(goal => {
    const goalId = String(goal.id);
    const allocated = allocations
      .filter(a => String(a.goalId) === goalId)
      .reduce((sum, a) => sum + a.actualAmount, 0);

    const totalAfter = (depositedByGoal[goalId] || 0) + allocated;
    const targetAmount = Number(goal.targetAmount) || 0;
    const isCompleted = totalAfter >= targetAmount - MONEY_EPSILON;

    if (isCompleted) {
      completeGoal_(goal, month);
      completedGoalIds.push(goal.id);
    }

    // Отклонение от плана месяца: пересчитываем будущие месяцы, срок не меняется
    const depositedThisMonth = goalDepositsBefore
      .filter(d => String(d.goalId) === goalId && d.month === month)
      .reduce((sum, d) => sum + d.actualAmount, 0) + allocated;

    const plannedThisMonth = plans
      .filter(p => String(p.goalId) === goalId && p.month === month)
      .reduce((sum, p) => sum + p.plannedAmount, 0);

    if (isCompleted || Math.abs(depositedThisMonth - plannedThisMonth) > MONEY_EPSILON) {
      if (replanFutureMonths_(plans, goalId, month, Math.max(targetAmount - totalAfter, 0))) {
        replannedGoalIds.push(goal.id);
      }
    }
  });

  return { success: true, completedGoalIds: completedGoalIds, replannedGoalIds: replannedGoalIds };
}

// Раскладывает остаток по цели поровну на месяцы плана после текущего.
// Если остатка нет, будущие месяцы обнуляются. Возвращает true, если были будущие месяцы.
function replanFutureMonths_(plans, goalId, currentMonth, remainingAmount) {
  const futureRows = plans
    .filter(p => String(p.goalId) === String(goalId) && p.month > currentMonth)
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  if (futureRows.length === 0) return false;

  const planSheet = getSheet_(GOAL_PLAN_SHEET_NAME);
  const planHeaders = getHeaderIndex_(planSheet, SHEET_HEADERS[GOAL_PLAN_SHEET_NAME]);

  const base = Math.floor(remainingAmount / futureRows.length);
  const extra = Math.round(remainingAmount - base * futureRows.length);

  futureRows.forEach((row, i) => {
    // Первые extra месяцев получают на рубль больше, чтобы сумма сошлась
    const amount = remainingAmount > 0 ? base + (i < extra ? 1 : 0) : 0;
    planSheet.getRange(row._row, planHeaders.plannedAmount + 1).setValue(amount);
  });

  return true;
}

// =========================
// Управление целями: изменение, удаление, переносы, повтор
// =========================

function findGoalById_(goalId) {
  return readGoals_().filter(g => String(g.id) === String(goalId))[0];
}

function setGoalFields_(goal, fields) {
  const sheet = getSheet_(GOALS_SHEET_NAME);
  const headers = getHeaderIndex_(sheet, SHEET_HEADERS[GOALS_SHEET_NAME]);
  Object.keys(fields).forEach(title => {
    if (headers[title] !== undefined) {
      sheet.getRange(goal._row, headers[title] + 1).setValue(fields[title]);
    }
  });
}

// Закрывает цель; у повторяющейся цели сразу создаёт следующий цикл
function completeGoal_(goal, month) {
  setGoalFields_(goal, { status: GOAL_STATUS_COMPLETED });

  const repeatMonths = Number(goal.repeatMonths) || 0;
  if (repeatMonths > 0) spawnNextCycle_(goal, month, repeatMonths);
}

function spawnNextCycle_(goal, month, repeatMonths) {
  const start = shiftMonth_(month, 1);
  let end = shiftMonth_(normalizeMonth_(goal.monthEnd), repeatMonths);
  if (end < start) end = shiftMonth_(start, repeatMonths - 1);

  const target = Number(goal.targetAmount);
  const months = [];
  for (let m = start; m <= end; m = shiftMonth_(m, 1)) months.push(m);

  const base = Math.floor(target / months.length);
  const extra = Math.round(target - base * months.length);
  const plan = months.map((m, i) => ({ month: m, plannedAmount: base + (i < extra ? 1 : 0) }));

  createGoal({
    name: goal.name,
    targetAmount: target,
    monthStart: start,
    monthEnd: end,
    monthlyAmount: plan[0].plannedAmount,
    createdAt: month + "-01",
    repeatMonths: repeatMonths,
    plan: plan
  });
}

// Раскладывает остаток цели поровну на месяцы, начиная с текущего.
// В строке текущего месяца уже внесённое сохраняется (план = внесено + доля).
function replanFromCurrentMonth_(goal, month, remaining) {
  const goalId = String(goal.id);
  const plans = readPlanRows_();
  const rows = plans
    .filter(p => String(p.goalId) === goalId && p.month >= month)
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  if (rows.length === 0) {
    writeRows_(GOAL_PLAN_SHEET_NAME, [{ goalId: goal.id, month: month, plannedAmount: remaining }]);
    setGoalFields_(goal, { monthEnd: month, monthlyAmount: remaining });
    return;
  }

  const depositedNow = readGoalDepositRows_()
    .filter(d => String(d.goalId) === goalId && d.month === month)
    .reduce((sum, d) => sum + d.actualAmount, 0);

  const sheet = getSheet_(GOAL_PLAN_SHEET_NAME);
  const headers = getHeaderIndex_(sheet, SHEET_HEADERS[GOAL_PLAN_SHEET_NAME]);
  const base = Math.floor(remaining / rows.length);
  const extra = Math.round(remaining - base * rows.length);

  let firstShare = 0;
  rows.forEach((row, i) => {
    const share = base + (i < extra ? 1 : 0);
    if (i === 0) firstShare = share;
    const value = row.month === month ? share + depositedNow : share;
    sheet.getRange(row._row, headers.plannedAmount + 1).setValue(value);
  });

  setGoalFields_(goal, { monthEnd: rows[rows.length - 1].month, monthlyAmount: firstShare });
}

// После изменения баланса: закрыть цель, если хватает, иначе пересчитать план
function afterBalanceChange_(goalId, month) {
  if (String(goalId) === CUSHION_GOAL_ID) return;

  const goal = findGoalById_(goalId);
  if (!goal || !isGoalActive_(goal)) return;

  const balance = sumBalanceByGoal_()[String(goal.id)] || 0;
  const target = Number(goal.targetAmount) || 0;

  if (balance >= target - MONEY_EPSILON) {
    completeGoal_(goal, month);
    replanFutureMonths_(readPlanRows_(), goal.id, month, 0);
  } else {
    replanFromCurrentMonth_(goal, month, target - balance);
  }
}

function updateGoal(data) {
  const goal = findGoalById_(data.id);
  if (!goal || String(goal.status).trim() === GOAL_STATUS_DELETED) throw new Error("Цель не найдена");
  if (!isGoalActive_(goal)) throw new Error("Закрытую цель изменить нельзя");

  const name = String(data.name || "").trim();
  const target = Number(data.targetAmount);
  if (!name) throw new Error("Укажите название цели");
  if (!isFinite(target) || target <= 0) throw new Error("Целевая сумма должна быть больше нуля");

  setGoalFields_(goal, { name: name, targetAmount: target });
  goal.targetAmount = target;
  goal.name = name;

  afterBalanceChange_(goal.id, getMonthKey_(data.month));
  return { success: true };
}

function deleteGoal(data) {
  const goal = findGoalById_(data.id);
  if (!goal || String(goal.status).trim() === GOAL_STATUS_DELETED) throw new Error("Цель не найдена");

  const month = getMonthKey_(data.month);
  const balance = sumBalanceByGoal_()[String(goal.id)] || 0;

  if (balance > MONEY_EPSILON) {
    const toId = String(data.moveToId || "");
    if (!toId) throw new Error("Укажите, куда перенести накопленные деньги");
    if (toId === String(goal.id)) throw new Error("Нельзя перенести деньги на удаляемую цель");

    if (toId !== CUSHION_GOAL_ID) {
      const target = findGoalById_(toId);
      if (!target || !isGoalActive_(target)) throw new Error("Цель для переноса не найдена или уже закрыта");
    }

    writeRows_(TRANSFERS_SHEET_NAME, [{ month: month, fromId: goal.id, toId: toId, amount: balance, type: "transfer" }]);
    setGoalFields_(goal, { status: GOAL_STATUS_DELETED });
    afterBalanceChange_(toId, month);
  } else {
    setGoalFields_(goal, { status: GOAL_STATUS_DELETED });
  }

  return { success: true };
}

function transferMoney(data) {
  const month = getMonthKey_(data.month);
  const type = String(data.type);
  const amount = Number(data.amount);
  const fromId = String(data.fromId || "");
  const toId = String(data.toId || "");

  if (type !== "transfer" && type !== "writeoff") throw new Error("Неизвестный тип операции");
  if (!isFinite(amount) || amount <= 0) throw new Error("Сумма должна быть больше нуля");
  if (!fromId) throw new Error("Не указан источник");

  const balances = sumBalanceByGoal_();

  if (fromId !== CUSHION_GOAL_ID) {
    const from = findGoalById_(fromId);
    if (!from || String(from.status).trim() === GOAL_STATUS_DELETED) throw new Error("Цель-источник не найдена");
  }
  if ((balances[fromId] || 0) < amount - MONEY_EPSILON) {
    throw new Error("Недостаточно денег: доступно " + (balances[fromId] || 0));
  }

  if (type === "transfer") {
    if (!toId) throw new Error("Не указано, куда переносить");
    if (toId === fromId) throw new Error("Источник и получатель совпадают");
    if (toId !== CUSHION_GOAL_ID) {
      const to = findGoalById_(toId);
      if (!to || !isGoalActive_(to)) throw new Error("Цель-получатель не найдена или уже закрыта");
    }
  }

  writeRows_(TRANSFERS_SHEET_NAME, [{
    month: month,
    fromId: fromId,
    toId: type === "transfer" ? toId : "",
    amount: amount,
    type: type
  }]);

  afterBalanceChange_(fromId, month);
  if (type === "transfer") afterBalanceChange_(toId, month);

  return { success: true };
}

// =========================
// Бюджет: доход и свободные деньги
// =========================

// По списку месяцев: доход, базовые расходы, запланированное на цели и свободный остаток.
// Если доход ещё не задан, configured = false, а income и free = null.
function getBudgetOverview(requestedMonths) {
  const months = Array.isArray(requestedMonths) && requestedMonths.length
    ? requestedMonths.map(m => getMonthKey_(m))
    : [getMonthKey_()];

  const settings = readTable_(BUDGET_SETTINGS_SHEET_NAME)
    .filter(row => String(row.effectiveFrom) !== "")
    .map(row => ({
      effectiveFrom: normalizeMonth_(row.effectiveFrom),
      monthlyIncome: Number(row.monthlyIncome) || 0,
      baseExpenses: Number(row.baseExpenses) || 0
    }));

  const actualIncomeRows = readTable_(MONTH_INCOME_SHEET_NAME)
    .filter(row => String(row.month) !== "")
    .map(row => ({ month: normalizeMonth_(row.month), actualIncome: Number(row.actualIncome) || 0 }));

  const activeGoalIds = readGoals_().filter(isGoalActive_).map(goal => String(goal.id));
  const plans = readPlanRows_().filter(p => activeGoalIds.indexOf(String(p.goalId)) !== -1);
  const deposits = readDepositRows_();

  return {
    configured: settings.length > 0,
    months: months.map(month => {
      const setting = findSettingForMonth_(settings, month);

      // Фактический доход месяца важнее значения из настроек; из нескольких записей берём последнюю
      const actualRows = actualIncomeRows.filter(row => row.month === month);
      const actualIncome = actualRows.length ? actualRows[actualRows.length - 1].actualIncome : null;

      const income = actualIncome !== null ? actualIncome : (setting ? setting.monthlyIncome : null);
      const baseExpenses = setting ? setting.baseExpenses : 0;

      const planned = plans
        .filter(p => p.month === month)
        .reduce((sum, p) => sum + p.plannedAmount, 0);

      const deposited = deposits
        .filter(d => d.month === month)
        .reduce((sum, d) => sum + d.amount, 0);

      return {
        month: month,
        income: income,
        incomeIsActual: actualIncome !== null,
        // доход из настроек (без поправки на фактически полученный в этом месяце)
        settingIncome: setting ? setting.monthlyIncome : null,
        baseExpenses: baseExpenses,
        planned: planned,
        deposited: deposited,
        free: income === null ? null : income - baseExpenses - planned
      };
    })
  };
}

// Таблица «месяц × цель»: план и внесённое по каждой цели и подушке, доход, отметка «все цели выполнены».
// Месяцы: от самого раннего в плане/взносах до самого позднего месяца плана.
function getMonthTable() {
  const goals = readGoals_().filter(g => String(g.status).trim() !== GOAL_STATUS_DELETED);
  const plans = readPlanRows_().filter(p => goals.some(g => String(g.id) === String(p.goalId)));
  const deposits = readGoalDepositRows_();
  const current = getMonthKey_();

  const all = plans.map(p => p.month).concat(deposits.map(d => d.month)).concat([current]);
  all.sort();
  const first = all[0];
  const last = all[all.length - 1];
  const months = [];
  for (let m = first; m <= last && months.length < 600; m = shiftMonth_(m, 1)) months.push(m);

  const budget = getBudgetOverview(months).months;
  const sum = (rows, key) => rows.reduce((t, r) => t + r[key], 0);

  const rows = months.map((month, i) => {
    const cells = goals.map(g => {
      const id = String(g.id);
      return {
        goalId: g.id,
        planned: sum(plans.filter(p => String(p.goalId) === id && p.month === month), "plannedAmount"),
        deposited: sum(deposits.filter(d => String(d.goalId) === id && d.month === month), "actualAmount")
      };
    });
    const cushion = sum(deposits.filter(d => String(d.goalId) === CUSHION_GOAL_ID && d.month === month), "actualAmount");
    const withPlan = cells.filter(c => c.planned > 0);

    return {
      month: month,
      income: budget[i].income,
      cells: cells,
      cushion: cushion,
      totalDeposited: sum(cells, "deposited") + cushion,
      // все цели с планом в этом месяце получили не меньше плана
      allDone: withPlan.length > 0 && withPlan.every(c => c.deposited >= c.planned - MONEY_EPSILON)
    };
  });

  return {
    goals: goals.map(g => ({ id: g.id, name: g.name, status: g.status })),
    months: rows,
    currentMonth: current
  };
}

// Настройка, действующая в месяце: самая поздняя из начавшихся не позже этого месяца.
// Если все настройки начинаются позже, берём самую раннюю.
function findSettingForMonth_(settings, month) {
  if (settings.length === 0) return null;

  // Порядок строк сохраняется, поэтому при равных месяцах побеждает последняя запись
  let best = null;
  settings.forEach(setting => {
    if (setting.effectiveFrom <= month && (best === null || setting.effectiveFrom >= best.effectiveFrom)) {
      best = setting;
    }
  });

  if (best) return best;

  return settings.reduce((earliest, setting) => (setting.effectiveFrom < earliest.effectiveFrom ? setting : earliest));
}

// data: { monthlyIncome, baseExpenses, effectiveFrom? } — действует с effectiveFrom (по умолчанию с текущего месяца)
function saveBudgetSettings(data) {
  const monthlyIncome = Number(data.monthlyIncome);
  const baseExpenses = Number(data.baseExpenses || 0);

  if (!isFinite(monthlyIncome) || monthlyIncome < 0) {
    throw new Error("Доход не может быть отрицательным");
  }
  if (!isFinite(baseExpenses) || baseExpenses < 0) {
    throw new Error("Расходы не могут быть отрицательными");
  }

  writeRows_(BUDGET_SETTINGS_SHEET_NAME, [{
    effectiveFrom: getMonthKey_(data.effectiveFrom),
    monthlyIncome: monthlyIncome,
    baseExpenses: baseExpenses
  }]);

  return { success: true };
}

// data: { month, actualIncome } — сколько реально получено в этом месяце
function saveMonthIncome(data) {
  const actualIncome = Number(data.actualIncome);

  if (!isFinite(actualIncome) || actualIncome < 0) {
    throw new Error("Доход не может быть отрицательным");
  }

  writeRows_(MONTH_INCOME_SHEET_NAME, [{
    month: getMonthKey_(data.month),
    actualIncome: actualIncome
  }]);

  return { success: true };
}

// =========================
// Чтение листов
// =========================

function readGoals_() {
  return readTable_(GOALS_SHEET_NAME).filter(goal => String(goal.id) !== "");
}

function readPlanRows_() {
  return readTable_(GOAL_PLAN_SHEET_NAME)
    .filter(row => String(row.goalId) !== "")
    .map(row => ({
      _row: row._row,
      goalId: row.goalId,
      month: normalizeMonth_(row.month),
      plannedAmount: Number(row.plannedAmount) || 0
    }));
}

function readGoalDepositRows_() {
  return readTable_(GOAL_DEPOSITS_SHEET_NAME)
    .filter(row => String(row.goalId) !== "")
    .map(row => ({
      goalId: row.goalId,
      month: normalizeMonth_(row.month),
      actualAmount: Number(row.actualAmount) || 0
    }));
}

function readDepositRows_() {
  return readTable_(DEPOSITS_SHEET_NAME)
    .filter(row => String(row.month) !== "")
    .map(row => ({
      month: normalizeMonth_(row.month),
      amount: Number(row.amount) || 0
    }));
}

function readTransferRows_() {
  return readTable_(TRANSFERS_SHEET_NAME)
    .filter(row => String(row.fromId) !== "")
    .map(row => ({
      month: normalizeMonth_(row.month),
      fromId: String(row.fromId),
      toId: String(row.toId),
      amount: Number(row.amount) || 0,
      type: String(row.type)
    }));
}

// { "<goalId>": накопленное по цели } = взносы + входящие переносы − исходящие переносы − списания
function sumBalanceByGoal_() {
  const totals = {};

  readGoalDepositRows_().forEach(row => {
    const key = String(row.goalId);
    totals[key] = (totals[key] || 0) + row.actualAmount;
  });

  readTransferRows_().forEach(row => {
    totals[row.fromId] = (totals[row.fromId] || 0) - row.amount;
    if (row.type === "transfer" && row.toId !== "") {
      totals[row.toId] = (totals[row.toId] || 0) + row.amount;
    }
  });

  return totals;
}

function isGoalActive_(goal) {
  return ACTIVE_STATUS_VALUES.indexOf(String(goal.status).trim()) !== -1;
}

// =========================
// Работа с таблицей
// =========================

function getSheet_(sheetName) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(sheetName);

  if (sheet) return sheet;

  if (AUTO_CREATED_SHEETS.indexOf(sheetName) !== -1) {
    const headers = SHEET_HEADERS[sheetName];
    const created = SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName);
    created.getRange(1, 1, 1, headers.length).setValues([headers]);
    return created;
  }

  throw new Error("Не найден лист «" + sheetName + "»");
}

// Возвращает { имяКолонки: индекс (с 0) }. Проверяет обязательные заголовки.
function getHeaderIndex_(sheet, requiredHeaders) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error("На листе «" + sheet.getName() + "» нет заголовков");
  }

  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const headerIndex = {};

  headerRow.forEach((title, index) => {
    const key = String(title).trim();
    if (key) headerIndex[key] = index;
  });

  requiredHeaders.forEach(title => {
    if (headerIndex[title] === undefined) {
      throw new Error("На листе «" + sheet.getName() + "» нет колонки «" + title + "»");
    }
  });

  return headerIndex;
}

// Добавляет в конец строки заголовков необязательные колонки, которых ещё нет
function ensureOptionalColumns_(sheet, sheetName) {
  const optional = OPTIONAL_HEADERS[sheetName];
  if (!optional) return;

  const lastColumn = sheet.getLastColumn();
  const existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(title => String(title).trim());

  let nextColumn = lastColumn + 1;
  optional.forEach(title => {
    if (existing.indexOf(title) === -1) {
      sheet.getRange(1, nextColumn).setValue(title);
      nextColumn++;
    }
  });
}

// Читает лист в массив объектов { заголовок: значение, _row: номер строки }
function readTable_(sheetName) {
  const sheet = getSheet_(sheetName);
  ensureOptionalColumns_(sheet, sheetName);
  const headerIndex = getHeaderIndex_(sheet, SHEET_HEADERS[sheetName]);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  return values.map((row, i) => {
    const item = { _row: i + 2 };
    Object.keys(headerIndex).forEach(title => {
      item[title] = row[headerIndex[title]];
    });
    return item;
  });
}

// Первая свободная строка по колонке A (формулы с "" ниже данных не мешают)
function findFirstEmptyRow_(sheet) {
  const columnA = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();

  for (let i = columnA.length - 1; i >= 0; i--) {
    if (String(columnA[i][0]) !== "") return i + 2;
  }

  return 2;
}

// Дописывает строки в конец листа. rows — массив объектов { заголовок: значение }.
// Пишет только в указанные колонки, не затрагивая остальные (например, формулы).
function writeRows_(sheetName, rows) {
  if (rows.length === 0) return;

  const sheet = getSheet_(sheetName);
  ensureOptionalColumns_(sheet, sheetName);
  const headerIndex = getHeaderIndex_(sheet, SHEET_HEADERS[sheetName]);
  const firstRow = findFirstEmptyRow_(sheet);
  const lastNeededRow = firstRow + rows.length - 1;

  if (lastNeededRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), lastNeededRow - sheet.getMaxRows());
  }

  const writtenTitles = Object.keys(rows[0]).filter(title => headerIndex[title] !== undefined);
  const columnNumbers = writtenTitles.map(title => headerIndex[title] + 1);
  const firstColumn = Math.min.apply(null, columnNumbers);
  const lastColumn = Math.max.apply(null, columnNumbers);
  const isContiguous = (lastColumn - firstColumn + 1) === writtenTitles.length;

  if (isContiguous) {
    // Все записываемые колонки идут подряд — пишем одним блоком
    const block = rows.map(row => {
      const line = [];
      for (let c = firstColumn; c <= lastColumn; c++) {
        const title = writtenTitles.filter(t => headerIndex[t] + 1 === c)[0];
        line.push(row[title]);
      }
      return line;
    });

    sheet.getRange(firstRow, firstColumn, rows.length, lastColumn - firstColumn + 1).setValues(block);
    return;
  }

  // Колонки не подряд — пишем по ячейкам
  rows.forEach((row, i) => {
    writtenTitles.forEach(title => {
      sheet.getRange(firstRow + i, headerIndex[title] + 1).setValue(row[title]);
    });
  });
}

// Защита от одновременной записи двумя запросами
function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

// =========================
// Месяцы ("yyyy-MM")
// =========================

// Google Таблицы могут превратить "2026-10" в дату — приводим обратно к строке
function normalizeMonth_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(),
      "yyyy-MM"
    );
  }

  return String(value).trim().slice(0, 7);
}

// Месяц из запроса, а если не передан — текущий
function getMonthKey_(requestedMonth) {
  if (requestedMonth && /^\d{4}-\d{2}$/.test(String(requestedMonth))) {
    return String(requestedMonth);
  }

  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
}

function shiftMonth_(monthKey, shift) {
  const parts = monthKey.split("-");
  const shifted = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + shift, 1));

  return shifted.getUTCFullYear() + "-" + String(shifted.getUTCMonth() + 1).padStart(2, "0");
}

// =========================
// Универсальный JSON ответ
// =========================

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
