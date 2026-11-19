import { test } from "node:test";
import assert from "node:assert/strict";
import { CUSHION_ID, distribute, suggestOvercapTarget } from "./distribute.ts";
import type { DistributionGoal } from "./distribute.ts";

const phone: DistributionGoal = { id: "phone", need: 20000, remaining: 60000, endMonth: "2027-01" };
const trip: DistributionGoal = { id: "trip", need: 10000, remaining: 15000, endMonth: "2026-12" };
const car: DistributionGoal = { id: "car", need: 5000, remaining: 500000, endMonth: "2030-01" };

const total = (values: Record<string, number>) => Object.values(values).reduce((s, v) => s + v, 0);

test("сумма равна плану: каждая цель получает свой план, подушка пуста", () => {
  const r = distribute({ amount: 30000, goals: [phone, trip], locked: {} });
  assert.equal(r.values.phone, 20000);
  assert.equal(r.values.trip, 10000);
  assert.equal(r.values[CUSHION_ID], 0);
  assert.equal(r.amountAdjusted, false);
});

test("излишек уходит на цель с ближайшим сроком, но не больше её остатка", () => {
  // trip: срок раньше, остаток 15000, по плану 10000 -> может взять ещё 5000
  const r = distribute({ amount: 40000, goals: [phone, trip], locked: {} });
  assert.equal(r.values.trip, 15000);
  assert.equal(r.surplusPart.trip, 5000);
  // остальной излишек: phone берёт по плану 20000 + 5000
  assert.equal(r.values.phone, 25000);
  assert.equal(r.values[CUSHION_ID], 0);
  assert.equal(total(r.values), 40000);
});

test("излишек сверх остатков всех целей идёт в подушку", () => {
  const small: DistributionGoal = { id: "small", need: 1000, remaining: 3000, endMonth: "2026-12" };
  const r = distribute({ amount: 10000, goals: [small], locked: {} });
  assert.equal(r.values.small, 3000);
  assert.equal(r.values[CUSHION_ID], 7000);
  assert.equal(total(r.values), 10000);
});

test("не хватает на план: деньги получает цель с ближайшим сроком", () => {
  const r = distribute({ amount: 12000, goals: [phone, trip], locked: {} });
  assert.equal(r.values.trip, 10000);
  assert.equal(r.values.phone, 2000);
  assert.equal(r.values[CUSHION_ID], 0);
});

test("ручная сумма закрепляется, остальное перераспределяется", () => {
  const r = distribute({ amount: 35000, goals: [phone, trip, car], locked: { phone: 5000 } });
  assert.equal(r.values.phone, 5000);
  // свободно 30000: по плану trip 10000 и car 5000, излишек 15000:
  // trip добирает 5000 до остатка своей цели, остальные 10000 получает car
  assert.equal(r.values.trip, 15000);
  assert.equal(r.values.car, 15000);
  assert.equal(r.values[CUSHION_ID], 0);
  assert.equal(total(r.values), 35000);
});

test("закреплены все цели и подушка не закреплена: разница уходит в подушку", () => {
  const r = distribute({ amount: 30000, goals: [phone, trip], locked: { phone: 5000, trip: 5000 } });
  assert.equal(r.values[CUSHION_ID], 20000);
  assert.equal(r.amountAdjusted, false);
});

test("вручную распределено больше введённого: сумма внесения растёт", () => {
  const r = distribute({ amount: 10000, goals: [phone, trip], locked: { phone: 20000, trip: 10000 } });
  assert.equal(r.effectiveAmount, 30000);
  assert.equal(r.amountAdjusted, true);
  assert.equal(r.values[CUSHION_ID], 0);
});

test("всё закреплено, включая подушку, и сумма меньше введённой: сумма внесения уменьшается", () => {
  const r = distribute({
    amount: 30000,
    goals: [phone],
    locked: { phone: 10000, [CUSHION_ID]: 5000 }
  });
  assert.equal(r.effectiveAmount, 15000);
  assert.equal(r.amountAdjusted, true);
});

test("нет целей: всё в подушку", () => {
  const r = distribute({ amount: 7000, goals: [], locked: {} });
  assert.equal(r.values[CUSHION_ID], 7000);
});

test("сумма распределения всегда равна эффективной сумме внесения", () => {
  const cases = [
    { amount: 0, locked: {} },
    { amount: 1, locked: {} },
    { amount: 99999, locked: { phone: 123 } },
    { amount: 500, locked: { phone: 600, trip: 100 } },
    { amount: 50000, locked: { car: 100000 } }
  ];
  cases.forEach(c => {
    const r = distribute({ amount: c.amount, goals: [phone, trip, car], locked: c.locked });
    assert.equal(total(r.values), r.effectiveAmount, JSON.stringify(c));
  });
});

test("оверкап: предложение — цель с ближайшим сроком и свободным остатком, иначе подушка", () => {
  const values = { phone: 20000, trip: 10000, car: 5000 };
  assert.equal(suggestOvercapTarget("phone", [phone, trip, car], values), "trip");
  assert.equal(suggestOvercapTarget("trip", [phone, trip, car], values), "phone");

  const full = { phone: 60000, trip: 15000, car: 500000 };
  assert.equal(suggestOvercapTarget("phone", [phone, trip, car], full), CUSHION_ID);
});
