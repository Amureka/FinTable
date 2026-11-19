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
  [MONTH_INCOME_SHEET_NAME]: ["month", "actualIncome"]
};

// Эти листы создаются автоматически, если их нет в таблице
const AUTO_CREATED_SHEETS = [BUDGET_SETTINGS_SHEET_NAME, MONTH_INCOME_SHEET_NAME];

const GOAL_STATUS_ACTIVE = "Активна";
const GOAL_STATUS_COMPLETED = "Выполнена";
// Какие значения в колонке status считаются «активна»
const ACTIVE_STATUS_VALUES = ["Активна", "active"];

const MONEY_EPSILON = 0.005;

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

    case "saveDeposit":
      return withLock_(() => saveDeposit(data));

    case "getBudgetOverview":
      return getBudgetOverview(data.months);

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
  const goals = readGoals_();
  const depositedByGoal = sumDepositsByGoal_();

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
    createdAt: goal.createdAt
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

  // currentAmount не записываем: колонка может считаться формулой таблицы
  writeRows_(GOALS_SHEET_NAME, [{
    id: goalId,
    name: name,
    targetAmount: targetAmount,
    monthStart: data.monthStart,
    monthEnd: data.monthEnd,
    monthlyAmount: data.monthlyAmount,
    status: GOAL_STATUS_ACTIVE,
    createdAt: data.createdAt
  }]);

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

// Данные для окна «Внести деньги»: по каждой активной цели
function getDepositPreview(requestedMonth) {
  const currentMonth = getMonthKey_(requestedMonth);
  const previousMonths = [-3, -2, -1].map(shift => shiftMonth_(currentMonth, shift));

  const plans = readPlanRows_();
  const goalDeposits = readGoalDepositRows_();
  const depositedByGoal = sumDepositsByGoal_();

  return readGoals_()
    .filter(isGoalActive_)
    .map(goal => {
      const goalId = String(goal.id);

      const plannedAmount = plans
        .filter(p => String(p.goalId) === goalId && p.month === currentMonth)
        .reduce((sum, p) => sum + p.plannedAmount, 0);

      const depositedInMonth = month => goalDeposits
        .filter(d => String(d.goalId) === goalId && d.month === month)
        .reduce((sum, d) => sum + d.actualAmount, 0);

      const targetAmount = Number(goal.targetAmount) || 0;
      const currentAmount = depositedByGoal[goalId] || 0;

      return {
        goalId: goal.id,
        name: goal.name,
        targetAmount: targetAmount,
        currentAmount: currentAmount,
        remainingAmount: Math.max(targetAmount - currentAmount, 0),
        plannedAmount: plannedAmount,
        currentMonthDeposits: depositedInMonth(currentMonth),
        previousMonthsDeposits: previousMonths.map(month => ({
          month: month,
          amount: depositedInMonth(month)
        }))
      };
    });
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
  if (allocatedTotal > depositAmount + MONEY_EPSILON) {
    throw new Error("Сумма по целям (" + allocatedTotal + ") больше внесённой суммы (" + depositAmount + ")");
  }

  // Проверяем цели: существуют, активны, не превышаем остаток
  const goals = readGoals_();
  const depositedByGoal = sumDepositsByGoal_();

  allocations.forEach(a => {
    const goal = goals.filter(g => String(g.id) === String(a.goalId))[0];

    if (!goal) {
      throw new Error("Цель не найдена: " + a.goalId);
    }
    if (!isGoalActive_(goal)) {
      throw new Error("Цель «" + goal.name + "» уже закрыта — вносить на неё нельзя");
    }

    const remaining = Number(goal.targetAmount) - (depositedByGoal[String(goal.id)] || 0);
    if (a.actualAmount > remaining + MONEY_EPSILON) {
      throw new Error("Сумма по цели «" + goal.name + "» больше остатка до цели (" + remaining + ")");
    }
  });

  // Запись: общий взнос и распределение по целям
  writeRows_(DEPOSITS_SHEET_NAME, [{ month: month, amount: depositAmount }]);

  writeRows_(GOAL_DEPOSITS_SHEET_NAME, allocations.map(a => ({
    goalId: a.goalId,
    month: month,
    actualAmount: a.actualAmount
  })));

  // Закрываем цели, которые достигли целевой суммы
  const completedGoalIds = [];
  const goalsSheet = getSheet_(GOALS_SHEET_NAME);
  const goalsHeaders = getHeaderIndex_(goalsSheet, SHEET_HEADERS[GOALS_SHEET_NAME]);

  allocations.forEach(a => {
    const goal = goals.filter(g => String(g.id) === String(a.goalId))[0];
    const newTotal = (depositedByGoal[String(goal.id)] || 0) + a.actualAmount;

    if (newTotal >= Number(goal.targetAmount) - MONEY_EPSILON) {
      goalsSheet.getRange(goal._row, goalsHeaders.status + 1).setValue(GOAL_STATUS_COMPLETED);
      completedGoalIds.push(goal.id);
    }
  });

  return { success: true, completedGoalIds: completedGoalIds };
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

// { "<goalId>": сумма всех взносов по цели }
function sumDepositsByGoal_() {
  const totals = {};

  readGoalDepositRows_().forEach(row => {
    const key = String(row.goalId);
    totals[key] = (totals[key] || 0) + row.actualAmount;
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

// Читает лист в массив объектов { заголовок: значение, _row: номер строки }
function readTable_(sheetName) {
  const sheet = getSheet_(sheetName);
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
