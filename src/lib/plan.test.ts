import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  monthsInclusive,
  planFromEndMonth,
  planFromMonthly,
  MAX_PLAN_MONTHS
} from "./plan.ts";

const start = { year: 2026, month: 11 };

test("addMonths переходит через год и не зависит от числа дня", () => {
  assert.deepEqual(addMonths({ year: 2026, month: 11 }, 2), { year: 2027, month: 1 });
  assert.deepEqual(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(addMonths({ year: 2026, month: 1 }, 0), { year: 2026, month: 1 });
});

test("monthsInclusive считает текущий и конечный месяц", () => {
  assert.equal(monthsInclusive(start, { year: 2026, month: 11 }), 1);
  assert.equal(monthsInclusive(start, { year: 2027, month: 2 }), 4);
  assert.equal(monthsInclusive(start, { year: 2026, month: 9 }), -1);
});

test("месяц окончания -> сумма в месяц, сумма плана равна цели", () => {
  const r = planFromEndMonth(60000, start, { year: 2027, month: 1 });
  assert.ok(r.ok);
  assert.equal(r.monthly, 20000);
  assert.equal(r.months, 3);
  assert.equal(r.plan.reduce((s, p) => s + p.plannedAmount, 0), 60000);
});

test("остаток последнего месяца не бывает копеечным", () => {
  const r = planFromEndMonth(100, start, { year: 2027, month: 2 });
  assert.ok(r.ok);
  assert.deepEqual(r.plan.map(p => p.plannedAmount), [25, 25, 25, 25]);

  const r2 = planFromEndMonth(100, start, { year: 2027, month: 1 });
  assert.ok(r2.ok);
  assert.deepEqual(r2.plan.map(p => p.plannedAmount), [34, 34, 32]);
});

test("если взнос выходит больше нужного, план сокращается и конец сдвигается", () => {
  // 10 рублей за 9 месяцев: взнос 2, хватит 5 месяцев
  const r = planFromEndMonth(10, start, { year: 2027, month: 7 });
  assert.ok(r.ok);
  assert.equal(r.monthly, 2);
  assert.equal(r.months, 5);
  assert.ok(r.plan.every(p => p.plannedAmount > 0));
});

test("сумма в месяц -> месяц окончания", () => {
  const r = planFromMonthly(50000, start, 16667);
  assert.ok(r.ok);
  assert.equal(r.months, 3);
  assert.deepEqual(r.endMonth, { year: 2027, month: 1 });
  assert.deepEqual(r.plan.map(p => p.plannedAmount), [16667, 16667, 16666]);
});

test("взнос больше цели ограничивается целью", () => {
  const r = planFromMonthly(60000, start, 100000);
  assert.ok(r.ok);
  assert.equal(r.monthly, 60000);
  assert.equal(r.months, 1);
  assert.equal(r.cappedToTarget, true);
});

test("месяц окончания в прошлом — ошибка", () => {
  const r = planFromEndMonth(60000, start, { year: 2026, month: 9 });
  assert.equal(r.ok, false);
});

test("ноль, минус и дробные значения — ошибка", () => {
  assert.equal(planFromMonthly(100, start, 0).ok, false);
  assert.equal(planFromMonthly(100, start, -5).ok, false);
  assert.equal(planFromMonthly(100, start, 33.5).ok, false);
  assert.equal(planFromMonthly(0, start, 10).ok, false);
  assert.equal(planFromMonthly(100.5, start, 10).ok, false);
});

test("срок больше потолка — ошибка, и это не подвешивает расчёт", () => {
  const r = planFromMonthly(1000000, start, 500);
  assert.equal(r.ok, false);
  const r2 = planFromMonthly(MAX_PLAN_MONTHS * 100, start, 100);
  assert.ok(r2.ok);
  assert.equal(r2.months, MAX_PLAN_MONTHS);
});
