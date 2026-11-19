import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, DatePicker, Form, Input, Modal, Row, Select, Table, Typography, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { callApi } from "../lib/api";
import MoneyInput from "./MoneyInput";
import { currentMonthKey, formatMoney, formatMonthLabel } from "../lib/format";
import { BudgetOverview } from "../lib/types";
import {
  MonthRef,
  PlanItem,
  PlanResult,
  monthKey,
  planFromEndMonth,
  planFromMonthly
} from "../lib/plan";

interface FormValues {
  name?: string;
  targetAmount?: number | null;
  endMonth?: Dayjs | null;
  monthlyAmount?: number | null;
  repeatMonths?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onOpenBudgetSettings: () => void;
  // меняется после сохранения настроек бюджета — тогда данные о свободных деньгах загружаются заново
  budgetRevision: number;
}

function currentMonthRef(): MonthRef {
  const now = dayjs();
  return { year: now.year(), month: now.month() + 1 };
}

function toMonthRef(date: Dayjs): MonthRef {
  return { year: date.year(), month: date.month() + 1 };
}

export default function CreateGoalModal({ open, onClose, onCreated, onOpenBudgetSettings, budgetRevision }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [budget, setBudget] = useState<BudgetOverview | null>(null);

  // Свободные деньги по месяцам плана (или только за текущий месяц, пока плана нет)
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const months = plan.length > 0 ? plan.map(item => item.month) : [currentMonthKey()];

    callApi<BudgetOverview>("getBudgetOverview", { months })
      .then(result => {
        if (!cancelled) setBudget(result);
      })
      .catch(() => {
        if (!cancelled) setBudget(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, plan, budgetRevision]);

  const freeByMonth = useMemo(() => {
    const map = new Map<string, number | null>();
    budget?.months.forEach(item => map.set(item.month, item.free));
    return map;
  }, [budget]);

  function applyResult(result: PlanResult) {
    if (!result.ok) {
      setPlan([]);
      setPlanError(result.error);
      setPlanNote(null);
      return;
    }

    setPlanError(null);
    setPlan(result.plan);
    setPlanNote(result.cappedToTarget ? "Взнос ограничен целевой суммой: цель закроется за один месяц." : null);

    // Обновляем оба поля по итогам расчёта (программная запись не вызывает onValuesChange)
    form.setFieldsValue({
      monthlyAmount: result.monthly,
      endMonth: dayjs(`${monthKey(result.endMonth)}-01`)
    });
  }

  function clearPlan() {
    setPlan([]);
    setPlanError(null);
    setPlanNote(null);
  }

  // Пересчёт: источник — то поле, которое пользователь менял последним
  function recalculate(source: "target" | "endMonth" | "monthly", values: FormValues) {
    const { targetAmount, endMonth, monthlyAmount } = values;

    if (!targetAmount) {
      clearPlan();
      return;
    }

    const start = currentMonthRef();

    // При смене суммы цели считаем по тому полю, которое уже задано (приоритет у срока)
    const useEndMonth = source === "endMonth" || (source === "target" && endMonth);
    const useMonthly = source === "monthly" || (source === "target" && !endMonth && monthlyAmount);

    if (useEndMonth && endMonth) {
      applyResult(planFromEndMonth(targetAmount, start, toMonthRef(endMonth)));
    } else if (useMonthly && monthlyAmount) {
      applyResult(planFromMonthly(targetAmount, start, monthlyAmount));
    } else if (source === "endMonth" && monthlyAmount) {
      // месяц окончания очистили, но взнос задан — план строим по взносу
      applyResult(planFromMonthly(targetAmount, start, monthlyAmount));
    } else if (source === "monthly" && endMonth) {
      // взнос очистили, но месяц задан — план строим по месяцу
      applyResult(planFromEndMonth(targetAmount, start, toMonthRef(endMonth)));
    } else {
      clearPlan();
    }
  }

  function handleValuesChange(changed: FormValues, all: FormValues) {
    if ("targetAmount" in changed) recalculate("target", all);
    else if ("endMonth" in changed) recalculate("endMonth", all);
    else if ("monthlyAmount" in changed) recalculate("monthly", all);
  }

  function handleClose() {
    form.resetFields();
    clearPlan();
    onClose();
  }

  async function handleSave() {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (plan.length === 0) {
      setPlanError(planError ?? "Выберите месяц окончания или сумму в месяц");
      return;
    }

    setSaving(true);
    try {
      await callApi("createGoal", {
        name: (values.name ?? "").trim(),
        targetAmount: values.targetAmount,
        monthStart: plan[0].month,
        monthEnd: plan[plan.length - 1].month,
        monthlyAmount: values.monthlyAmount,
        createdAt: dayjs().format("YYYY-MM-DD"),
        repeatMonths: values.repeatMonths || undefined,
        plan
      });

      message.success("Цель сохранена");
      handleClose();
      onCreated();
    } catch (error) {
      message.error(`Ошибка сохранения: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const total = plan.reduce((sum, item) => sum + item.plannedAmount, 0);

  const configured = budget?.configured === true;
  const thisMonth = budget?.months[0];
  const monthsOverBudget = plan.filter(item => {
    const free = freeByMonth.get(item.month);
    return free !== null && free !== undefined && free - item.plannedAmount < 0;
  }).length;

  const firstPlanned = plan[0]?.plannedAmount ?? 0;
  const freeAfterFirst = thisMonth && thisMonth.free !== null ? thisMonth.free - firstPlanned : null;

  const columns = [
    { title: "Месяц", dataIndex: "month", render: (value: string) => formatMonthLabel(value) },
    { title: "Сумма", dataIndex: "plannedAmount", align: "right" as const, render: (value: number) => formatMoney(value) },
    ...(configured
      ? [
          {
            title: "Останется свободно",
            key: "freeAfter",
            align: "right" as const,
            render: (_: unknown, item: PlanItem) => {
              const free = freeByMonth.get(item.month);
              if (free === null || free === undefined) return "—";
              const rest = free - item.plannedAmount;
              return <Typography.Text type={rest < 0 ? "danger" : undefined}>{formatMoney(rest)}</Typography.Text>;
            }
          }
        ]
      : [])
  ];

  return (
    <Modal
      title="Создать цель"
      open={open}
      onCancel={handleClose}
      onOk={handleSave}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={saving}
      width={640}
      centered
      className="fit-modal fit-modal-table"
      destroyOnClose
    >
      <Form form={form} layout="vertical" onValuesChange={handleValuesChange} requiredMark={false} className="compact-form">
        <Row gutter={12}>
          <Col xs={24} sm={14}>
            <Form.Item
              label="Название цели"
              name="name"
              rules={[{ required: true, whitespace: true, message: "Введите название цели" }]}
            >
              <Input maxLength={80} placeholder="Например, ноутбук" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item
              label="Целевая сумма"
              name="targetAmount"
              rules={[{ required: true, message: "Введите целевую сумму" }]}
            >
              <MoneyInput min={1} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item label="Месяц окончания" name="endMonth">
              <DatePicker
                picker="month"
                format="MMMM YYYY"
                style={{ width: "100%" }}
                placeholder="Выберите месяц"
                disabledDate={date => date.isBefore(dayjs().startOf("month"))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Сумма в месяц" name="monthlyAmount">
              <MoneyInput min={1} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Повтор цели" name="repeatMonths" initialValue={0}>
          <Select
            options={[
              { value: 0, label: "Не повторять" },
              { value: 1, label: "Каждый месяц" },
              { value: 3, label: "Раз в 3 месяца" },
              { value: 6, label: "Раз в 6 месяцев" },
              { value: 12, label: "Раз в год" }
            ]}
          />
        </Form.Item>
      </Form>

      {budget && !configured && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message="Укажите доход, чтобы видеть, сколько денег можно распределить."
          action={
            <Button size="small" onClick={onOpenBudgetSettings}>
              Указать доход
            </Button>
          }
        />
      )}

      {configured && thisMonth && thisMonth.free !== null && (
        <Alert
          type={freeAfterFirst !== null && freeAfterFirst < 0 ? "warning" : "success"}
          showIcon
          style={{ marginBottom: 8 }}
          message={
            <>
              Свободно в этом месяце: <b>{formatMoney(thisMonth.free)}</b>
              {" "}
              <Typography.Text type="secondary" className="hide-xs">
                (доход {formatMoney(thisMonth.income)} − расходы {formatMoney(thisMonth.baseExpenses)} − уже запланировано {formatMoney(thisMonth.planned)})
              </Typography.Text>
              {plan.length > 0 && freeAfterFirst !== null && (
                <>
                  {" "}После этой цели останется: <b>{formatMoney(freeAfterFirst)}</b>
                </>
              )}
            </>
          }
        />
      )}

      {monthsOverBudget > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={`В ${monthsOverBudget} мес. плана взносы превышают свободные деньги. Цель всё равно можно сохранить.`}
        />
      )}

      {planError && <Alert type="error" message={planError} showIcon style={{ marginBottom: 8 }} />}
      {planNote && <Alert type="info" message={planNote} showIcon style={{ marginBottom: 8 }} />}

      <Typography.Text strong>План накоплений</Typography.Text>

      <div className="plan-table-wrap">
        <Table<PlanItem>
          size="small"
          rowKey="month"
          pagination={false}
          dataSource={plan}
          locale={{ emptyText: "Укажите сумму и срок или взнос" }}
          columns={columns}
        />
      </div>

      {plan.length > 0 && (
        <Typography.Text type="secondary">
          Итого: {formatMoney(total)}, {plan.length} мес.
        </Typography.Text>
      )}
    </Modal>
  );
}
