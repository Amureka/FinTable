import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Space, Table, Tag, Typography, message } from "antd";
import { callApi } from "../lib/api";
import MoneyInput from "./MoneyInput";
import { currentMonthKey, formatMoney, formatMonthLabel } from "../lib/format";
import { DepositPreviewGoal, DepositSummary } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface RowData {
  key: string;
  label: string;
  kind: "past" | "deposited" | "now";
  month?: string;
}

const goalKey = (goal: DepositPreviewGoal) => String(goal.goalId);

export default function DepositModal({ open, onClose, onSaved }: Props) {
  const [goals, setGoals] = useState<DepositPreviewGoal[]>([]);
  const [summary, setSummary] = useState<DepositSummary | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const month = currentMonthKey();
      const [goalsResult, summaryResult] = await Promise.all([
        callApi<DepositPreviewGoal[]>("getDepositPreview", { month }),
        callApi<DepositSummary>("getDepositSummary", { month })
      ]);

      // По умолчанию: план минус уже внесённое в этом месяце, но не больше остатка до цели
      const defaults: Record<string, number> = {};
      goalsResult.forEach(goal => {
        const toDeposit = Math.max(goal.plannedAmount - goal.currentMonthDeposits, 0);
        defaults[goalKey(goal)] = Math.min(toDeposit, goal.remainingAmount);
      });

      setGoals(goalsResult);
      setSummary(summaryResult);
      setInputs(defaults);
      setAmount(Object.values(defaults).reduce((sum, value) => sum + value, 0));
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const allocated = useMemo(
    () => Object.values(inputs).reduce((sum, value) => sum + (value || 0), 0),
    [inputs]
  );

  const depositAmount = amount ?? 0;
  const overAllocated = allocated > depositAmount;
  const unallocated = depositAmount - allocated;

  const overRemaining = goals.filter(goal => (inputs[goalKey(goal)] || 0) > goal.remainingAmount);

  const alreadyDeposited = summary?.totalDeposited ?? 0;

  async function handleSave() {
    if (depositAmount <= 0) {
      message.error("Введите сумму внесения");
      return;
    }
    if (overAllocated) {
      message.error("Сумма по целям больше внесённой суммы");
      return;
    }
    if (allocated <= 0) {
      message.error("Распределите деньги хотя бы на одну цель");
      return;
    }

    setSaving(true);
    try {
      const result = await callApi<{ completedGoalIds?: unknown[] }>("saveDeposit", {
        month: currentMonthKey(),
        amount: depositAmount,
        allocations: goals.map(goal => ({
          goalId: goal.goalId,
          actualAmount: inputs[goalKey(goal)] || 0
        }))
      });

      const completed = result.completedGoalIds?.length ?? 0;
      message.success(completed ? `Взнос сохранён. Достигнуто целей: ${completed}` : "Взнос сохранён");

      onSaved();
      await load();
    } catch (error) {
      message.error(`Ошибка сохранения: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const rows: RowData[] = [
    ...(goals[0]?.previousMonthsDeposits ?? []).map((item, i) => ({
      key: `past-${i}`,
      label: formatMonthLabel(item.month),
      kind: "past" as const,
      month: item.month
    })),
    { key: "deposited", label: "Уже внесено в этом месяце", kind: "deposited" as const },
    { key: "now", label: "Вносим сейчас", kind: "now" as const }
  ];

  const columns = [
    {
      title: "",
      dataIndex: "label",
      fixed: "left" as const,
      width: 190,
      render: (label: string, row: RowData) =>
        row.kind === "deposited" ? <Tag color="blue">{label}</Tag> : <b>{label}</b>
    },
    ...goals.map(goal => ({
      title: goal.name,
      key: goalKey(goal),
      align: "center" as const,
      width: 160,
      render: (_: unknown, row: RowData) => {
        if (row.kind === "past") {
          const item = goal.previousMonthsDeposits.find(entry => entry.month === row.month);
          return item && item.amount ? formatMoney(item.amount) : "—";
        }

        if (row.kind === "deposited") {
          return goal.currentMonthDeposits ? <Tag color="blue">{formatMoney(goal.currentMonthDeposits)}</Tag> : "—";
        }

        const value = inputs[goalKey(goal)] ?? 0;
        const tooMuch = value > goal.remainingAmount;

        return (
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            <MoneyInput
              min={0}
              value={value}
              status={tooMuch ? "error" : undefined}
              style={{ width: "100%" }}
              onChange={next => setInputs(prev => ({ ...prev, [goalKey(goal)]: Number(next) || 0 }))}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              план {formatMoney(goal.plannedAmount)} − внесено {formatMoney(goal.currentMonthDeposits)}
            </Typography.Text>
          </Space>
        );
      }
    }))
  ];

  return (
    <Modal
      title="Внести деньги"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={saving}
      okButtonProps={{ disabled: loading || goals.length === 0 }}
      width={880}
      centered
      className="fit-modal"
      destroyOnClose
    >
      {loadError && <Alert type="error" showIcon message={`Не удалось загрузить данные: ${loadError}`} />}

      {!loadError && !loading && goals.length === 0 && (
        <Alert type="info" showIcon message="Нет активных целей. Сначала создайте цель." />
      )}

      {goals.length > 0 && (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap align="center">
            <Typography.Text>Сумма внесения:</Typography.Text>
            <MoneyInput min={0} value={amount} onChange={setAmount} />
            <Typography.Text type="secondary">
              по плану на месяц {formatMoney(summary?.totalPlanned)}, уже внесено {formatMoney(alreadyDeposited)}
            </Typography.Text>
          </Space>

          <Alert
            type="info"
            showIcon
            message="В поля подставлено «план минус уже внесённое в этом месяце». Суммы можно изменить."
          />

          {overAllocated && (
            <Alert type="error" showIcon message={`Сумма по целям больше внесённой на ${formatMoney(-unallocated)}`} />
          )}
          {!overAllocated && unallocated > 0 && (
            <Alert type="warning" showIcon message={`Не распределено ${formatMoney(unallocated)}`} />
          )}
          {!overAllocated && unallocated === 0 && depositAmount > 0 && (
            <Alert type="success" showIcon message={`Распределено ${formatMoney(allocated)} из ${formatMoney(depositAmount)}`} />
          )}
          {overRemaining.length > 0 && (
            <Alert
              type="error"
              showIcon
              message={`Больше остатка до цели: ${overRemaining.map(goal => `«${goal.name}» (остаток ${formatMoney(goal.remainingAmount)})`).join(", ")}`}
            />
          )}

          <Table<RowData>
            size="small"
            bordered
            loading={loading}
            pagination={false}
            dataSource={rows}
            columns={columns}
            scroll={{ x: "max-content" }}
            rowClassName={row => (row.kind === "deposited" ? "row-deposited" : "")}
          />
        </Space>
      )}
    </Modal>
  );
}
