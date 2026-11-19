import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Space, Table, Tag, Typography, message } from "antd";
import { callApi } from "../lib/api";
import { CUSHION_ID, DistributionGoal, distribute, suggestOvercapTarget } from "../lib/distribute";
import { currentMonthKey, formatMoney, formatMonthLabel } from "../lib/format";
import { DepositPreview, DepositPreviewGoal, DepositSummary } from "../lib/types";
import MoneyInput from "./MoneyInput";

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
  const [preview, setPreview] = useState<DepositPreview | null>(null);
  const [summary, setSummary] = useState<DepositSummary | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  // суммы, заданные вручную; остальное система распределяет сама
  const [locked, setLocked] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const goals = preview?.goals ?? [];

  // Исходные данные для алгоритма разлива: «нужно внести» = план минус уже внесённое
  const distributionGoals: DistributionGoal[] = useMemo(
    () =>
      goals.map(goal => ({
        id: goalKey(goal),
        need: Math.min(Math.max(goal.plannedAmount - goal.currentMonthDeposits, 0), goal.remainingAmount),
        remaining: goal.remainingAmount,
        endMonth: goal.monthEnd
      })),
    [goals]
  );

  const result = useMemo(
    () => distribute({ amount: amount ?? 0, goals: distributionGoals, locked }),
    [amount, distributionGoals, locked]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const month = currentMonthKey();
      const [previewResult, summaryResult] = await Promise.all([
        callApi<DepositPreview>("getDepositPreview", { month }),
        callApi<DepositSummary>("getDepositSummary", { month })
      ]);

      setPreview(previewResult);
      setSummary(summaryResult);
      setLocked({});

      // По умолчанию вносим «нужно внести» по всем целям
      const initialAmount = previewResult.goals.reduce(
        (sum, goal) =>
          sum + Math.min(Math.max(goal.plannedAmount - goal.currentMonthDeposits, 0), goal.remainingAmount),
        0
      );
      setAmount(initialAmount);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function setManualValue(id: string, value: number | null) {
    setLocked(prev => {
      const next = { ...prev };
      if (value === null) delete next[id];
      else next[id] = Math.max(Number(value) || 0, 0);
      return next;
    });
  }

  // Оверкап: на цели вносят больше, чем ей осталось до целевой суммы
  const overcaps = goals
    .map(goal => ({ goal, over: (result.values[goalKey(goal)] ?? 0) - goal.remainingAmount }))
    .filter(item => item.over > 0);

  function moveOvercap(fromId: string, toId: string, over: number) {
    const from = goals.find(goal => goalKey(goal) === fromId);
    if (!from) return;

    setLocked(prev => ({
      ...prev,
      [fromId]: from.remainingAmount,
      [toId]: (result.values[toId] ?? 0) + over
    }));
  }

  const goalName = (id: string) =>
    id === CUSHION_ID ? "Подушку безопасности" : `«${goals.find(goal => goalKey(goal) === id)?.name ?? ""}»`;

  async function handleSave() {
    if (result.effectiveAmount <= 0) {
      message.error("Введите сумму внесения");
      return;
    }

    setSaving(true);
    try {
      const response = await callApi<{ completedGoalIds?: unknown[]; replannedGoalIds?: unknown[] }>("saveDeposit", {
        month: currentMonthKey(),
        amount: result.effectiveAmount,
        allocations: [
          ...goals.map(goal => ({ goalId: goal.goalId, actualAmount: result.values[goalKey(goal)] || 0 })),
          { goalId: CUSHION_ID, actualAmount: result.values[CUSHION_ID] || 0 }
        ]
      });

      const completed = response.completedGoalIds?.length ?? 0;
      const replanned = response.replannedGoalIds?.length ?? 0;
      const parts = ["Взнос сохранён"];
      if (completed) parts.push(`достигнуто целей: ${completed}`);
      if (replanned) parts.push(`план пересчитан у целей: ${replanned}`);
      message.success(parts.join(". "));

      onSaved();
      await load();
    } catch (error) {
      message.error(`Ошибка сохранения: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const cushion = preview?.cushion;
  const goalsTotal = goals.reduce((sum, goal) => sum + (result.values[goalKey(goal)] || 0), 0);
  const cushionValue = result.values[CUSHION_ID] || 0;
  const hasLocks = Object.keys(locked).length > 0;

  const previousMonths = (goals[0]?.previousMonthsDeposits ?? cushion?.previousMonthsDeposits ?? []).map(item => item.month);

  const rows: RowData[] = [
    ...previousMonths.map((month, i) => ({
      key: `past-${i}`,
      label: formatMonthLabel(month),
      kind: "past" as const,
      month
    })),
    { key: "deposited", label: "Уже внесено в этом месяце", kind: "deposited" as const },
    { key: "now", label: "Вносим сейчас", kind: "now" as const }
  ];

  function renderCell(
    id: string,
    row: RowData,
    pastAmount: (month: string) => number,
    alreadyDeposited: number,
    goal?: DepositPreviewGoal
  ) {
    if (row.kind === "past") {
      const amountInMonth = pastAmount(row.month!);
      return amountInMonth ? formatMoney(amountInMonth) : "—";
    }

    if (row.kind === "deposited") {
      return alreadyDeposited ? <Tag color="blue">{formatMoney(alreadyDeposited)}</Tag> : "—";
    }

    const value = result.values[id] ?? 0;
    const isLocked = id in locked;
    const planPart = result.planPart[id] ?? 0;
    const surplus = result.surplusPart[id] ?? 0;
    const need = distributionGoals.find(item => item.id === id)?.need ?? 0;
    const shortage = goal && !isLocked ? Math.max(need - planPart, 0) : 0;

    return (
      <Space direction="vertical" size={2} style={{ width: "100%" }}>
        <MoneyInput
          min={0}
          value={value}
          status={goal && value > goal.remainingAmount ? "warning" : undefined}
          style={{ width: "100%" }}
          onChange={next => setManualValue(id, next === null ? null : Number(next))}
        />

        {goal && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            план {formatMoney(goal.plannedAmount)} − внесено {formatMoney(goal.currentMonthDeposits)}
          </Typography.Text>
        )}

        <Space size={[4, 4]} wrap style={{ justifyContent: "center" }}>
          {isLocked && (
            <Tag closable color="geekblue" onClose={() => setManualValue(id, null)}>
              вручную
            </Tag>
          )}
          {!isLocked && surplus > 0 && <Tag color="green">{goal ? `+${formatMoney(surplus)} сверх плана` : "остаток"}</Tag>}
          {shortage > 0 && <Tag color="orange">не хватает {formatMoney(shortage)}</Tag>}
        </Space>
      </Space>
    );
  }

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
      width: 170,
      render: (_: unknown, row: RowData) =>
        renderCell(
          goalKey(goal),
          row,
          month => goal.previousMonthsDeposits.find(entry => entry.month === month)?.amount ?? 0,
          goal.currentMonthDeposits,
          goal
        )
    })),
    {
      title: (
        <Space direction="vertical" size={0}>
          <span>Подушка безопасности</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
            накоплено {formatMoney(cushion?.currentAmount)}
          </Typography.Text>
        </Space>
      ),
      key: CUSHION_ID,
      align: "center" as const,
      width: 190,
      onHeaderCell: () => ({ style: { background: "#f6ffed" } }),
      render: (_: unknown, row: RowData) =>
        renderCell(
          CUSHION_ID,
          row,
          month => cushion?.previousMonthsDeposits.find(entry => entry.month === month)?.amount ?? 0,
          cushion?.currentMonthDeposits ?? 0
        )
    }
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
      okButtonProps={{ disabled: loading || !preview }}
      width={960}
      centered
      className="fit-modal"
      destroyOnClose
    >
      {loadError && <Alert type="error" showIcon message={`Не удалось загрузить данные: ${loadError}`} />}

      {preview && (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap align="center">
            <Typography.Text>Сумма внесения:</Typography.Text>
            <MoneyInput min={0} value={result.effectiveAmount} onChange={value => setAmount(Number(value) || 0)} />
            <Typography.Text type="secondary">
              по плану на месяц {formatMoney(summary?.totalPlanned)}, уже внесено {formatMoney(summary?.totalDeposited)}
            </Typography.Text>
          </Space>

          {result.amountAdjusted && (
            <Alert
              type="warning"
              showIcon
              message={`Вносимая сумма изменена до ${formatMoney(result.effectiveAmount)}: вы распределили вручную больше или меньше, чем вводили.`}
            />
          )}

          <Alert
            type="info"
            showIcon
            message={
              <>
                Деньги распределяются автоматически: сначала по плану («план минус уже внесённое»), излишек идёт на цель с
                ближайшим сроком, остаток в подушку безопасности. Любую сумму можно поменять вручную.
                {hasLocks && (
                  <>
                    {" "}
                    <Button type="link" size="small" onClick={() => setLocked({})} style={{ padding: 0 }}>
                      Сбросить ручные правки
                    </Button>
                  </>
                )}
              </>
            }
          />

          {overcaps.map(({ goal, over }) => {
            const fromId = goalKey(goal);
            const toId = suggestOvercapTarget(fromId, distributionGoals, result.values);
            return (
              <Alert
                key={fromId}
                type="warning"
                showIcon
                message={`На «${goal.name}» вносите на ${formatMoney(over)} больше, чем осталось до цели (${formatMoney(goal.remainingAmount)}).`}
                description={
                  <Space wrap>
                    <Button size="small" type="primary" onClick={() => moveOvercap(fromId, toId, over)}>
                      Перенести лишнее на {goalName(toId)}
                    </Button>
                    {toId !== CUSHION_ID && (
                      <Button size="small" onClick={() => moveOvercap(fromId, CUSHION_ID, over)}>
                        В подушку безопасности
                      </Button>
                    )}
                    <Typography.Text type="secondary">или оставьте как есть.</Typography.Text>
                  </Space>
                }
              />
            );
          })}

          <Alert
            type="success"
            showIcon
            message={`Распределено ${formatMoney(result.effectiveAmount)}: целям ${formatMoney(goalsTotal)}, в подушку ${formatMoney(cushionValue)}`}
          />

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
