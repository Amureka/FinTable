import { useState } from "react";
import { Alert, DatePicker, Form, Input, Modal, Table, Typography, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { callApi } from "../lib/api";
import MoneyInput from "./MoneyInput";
import { formatMoney, formatMonthLabel } from "../lib/format";
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
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function currentMonthRef(): MonthRef {
  const now = dayjs();
  return { year: now.year(), month: now.month() + 1 };
}

function toMonthRef(date: Dayjs): MonthRef {
  return { year: date.year(), month: date.month() + 1 };
}

export default function CreateGoalModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      destroyOnClose
    >
      <Form form={form} layout="vertical" onValuesChange={handleValuesChange} requiredMark={false}>
        <Form.Item
          label="Название цели"
          name="name"
          rules={[{ required: true, whitespace: true, message: "Введите название цели" }]}
        >
          <Input maxLength={80} placeholder="Например, ноутбук" />
        </Form.Item>

        <Form.Item
          label="Целевая сумма"
          name="targetAmount"
          rules={[{ required: true, message: "Введите целевую сумму" }]}
        >
          <MoneyInput min={1} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Месяц окончания" name="endMonth">
          <DatePicker
            picker="month"
            format="MMMM YYYY"
            style={{ width: "100%" }}
            placeholder="Выберите месяц"
            disabledDate={date => date.isBefore(dayjs().startOf("month"))}
          />
        </Form.Item>

        <Form.Item label="Сумма в месяц" name="monthlyAmount">
          <MoneyInput min={1} style={{ width: "100%" }} />
        </Form.Item>
      </Form>

      <Typography.Title level={5}>План накоплений</Typography.Title>

      {planError && <Alert type="error" message={planError} showIcon style={{ marginBottom: 12 }} />}
      {planNote && <Alert type="info" message={planNote} showIcon style={{ marginBottom: 12 }} />}

      <Table<PlanItem>
        size="small"
        rowKey="month"
        pagination={false}
        scroll={{ y: 240 }}
        dataSource={plan}
        locale={{ emptyText: "Укажите сумму и срок или взнос" }}
        columns={[
          { title: "Месяц", dataIndex: "month", render: (value: string) => formatMonthLabel(value) },
          { title: "Сумма", dataIndex: "plannedAmount", align: "right", render: (value: number) => formatMoney(value) }
        ]}
        summary={() =>
          plan.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>Итого, {plan.length} мес.</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  {formatMoney(total)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />
    </Modal>
  );
}
