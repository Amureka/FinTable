import { useEffect, useState } from "react";
import { Alert, App, Form, Input, Modal, Radio, Select, Typography } from "antd";
import { callApi } from "../lib/api";
import { CUSHION_ID } from "../lib/distribute";
import { currentMonthKey, formatMoney } from "../lib/format";
import { Goal, STATUS_COMPLETED } from "../lib/types";
import MoneyInput from "./MoneyInput";

const isActive = (goal: Goal) => goal.status !== STATUS_COMPLETED;

// ---------- Изменение цели ----------

interface EditProps {
  goal: Goal | null;
  onClose: () => void;
  onDone: () => void;
}

export function EditGoalModal({ goal, onClose, onDone }: EditProps) {
  const { message } = App.useApp();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setTarget(goal.targetAmount);
    }
  }, [goal]);

  if (!goal) return null;
  const remaining = target ? Math.max(target - goal.currentAmount, 0) : null;

  async function save() {
    if (!name.trim() || !target) {
      message.error("Заполните название и целевую сумму");
      return;
    }
    setSaving(true);
    try {
      await callApi("updateGoal", { id: goal!.id, name: name.trim(), targetAmount: target, month: currentMonthKey() });
      message.success("Цель обновлена");
      onClose();
      onDone();
    } catch (error) {
      message.error(`Ошибка: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Изменить цель" onCancel={onClose} onOk={save} okText="Сохранить" cancelText="Отмена" confirmLoading={saving} centered className="fit-modal" destroyOnHidden>
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Название цели">
          <Input value={name} maxLength={80} onChange={e => setName(e.target.value)} />
        </Form.Item>
        <Form.Item label="Целевая сумма">
          <MoneyInput min={1} value={target} style={{ width: "100%" }} onChange={v => setTarget(v === null ? null : Number(v))} />
        </Form.Item>
      </Form>
      <Alert
        type="info"
        showIcon
        message={
          remaining === 0
            ? "Накоплено уже не меньше новой суммы: цель будет закрыта."
            : `Накоплено ${formatMoney(goal.currentAmount)}, останется накопить ${formatMoney(remaining)}. Оставшаяся сумма заново поровну распределится по месяцам, начиная с текущего.`
        }
      />
    </Modal>
  );
}

// ---------- Удаление цели ----------

interface DeleteProps {
  goal: Goal | null;
  goals: Goal[];
  onClose: () => void;
  onDone: () => void;
}

export function DeleteGoalModal({ goal, goals, onClose, onDone }: DeleteProps) {
  const { message } = App.useApp();
  const [dest, setDest] = useState<string>(CUSHION_ID);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) setDest(CUSHION_ID);
  }, [goal]);

  if (!goal) return null;
  const hasMoney = goal.currentAmount > 0;
  const options = [
    { value: CUSHION_ID, label: "Подушка безопасности" },
    ...goals.filter(g => g.id !== goal.id && isActive(g)).map(g => ({ value: String(g.id), label: g.name }))
  ];

  async function remove() {
    setSaving(true);
    try {
      await callApi("deleteGoal", { id: goal!.id, moveToId: hasMoney ? dest : undefined, month: currentMonthKey() });
      message.success("Цель удалена");
      onClose();
      onDone();
    } catch (error) {
      message.error(`Ошибка: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`Удалить цель «${goal.name}»?`} onCancel={onClose} onOk={remove} okText="Удалить" okButtonProps={{ danger: true }} cancelText="Отмена" confirmLoading={saving} centered className="fit-modal" destroyOnHidden>
      {hasMoney ? (
        <>
          <Typography.Paragraph>
            На цели накоплено {formatMoney(goal.currentAmount)}. Куда перенести эти деньги?
          </Typography.Paragraph>
          <Select style={{ width: "100%" }} value={dest} options={options} onChange={setDest} />
        </>
      ) : (
        <Typography.Paragraph>На цели нет денег, она будет удалена сразу.</Typography.Paragraph>
      )}
    </Modal>
  );
}

// ---------- Перенос и списание ----------

interface TransferProps {
  open: boolean;
  goals: Goal[];
  cushionAmount: number;
  initialFromId?: string;
  onClose: () => void;
  onDone: () => void;
}

export function TransferModal({ open, goals, cushionAmount, initialFromId, onClose, onDone }: TransferProps) {
  const { message } = App.useApp();
  const [type, setType] = useState<"transfer" | "writeoff">("transfer");
  const [fromId, setFromId] = useState<string>(CUSHION_ID);
  const [toId, setToId] = useState<string | undefined>();
  const [amount, setAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType("transfer");
      setFromId(initialFromId ?? CUSHION_ID);
      setToId(undefined);
      setAmount(null);
    }
  }, [open, initialFromId]);

  const sources = [
    { id: CUSHION_ID, name: "Подушка безопасности", balance: cushionAmount },
    ...goals.map(g => ({ id: String(g.id), name: g.name, balance: g.currentAmount }))
  ];
  const balanceOf = (id: string) => sources.find(s => s.id === id)?.balance ?? 0;
  const available = balanceOf(fromId);

  const targets = [
    { value: CUSHION_ID, label: "Подушка безопасности" },
    ...goals.filter(g => isActive(g)).map(g => ({ value: String(g.id), label: g.name }))
  ].filter(t => t.value !== fromId);

  const target = goals.find(g => String(g.id) === toId);
  const closesTarget = type === "transfer" && target && amount ? target.currentAmount + amount >= target.targetAmount : false;

  async function save() {
    if (!amount || amount <= 0) return message.error("Введите сумму");
    if (amount > available) return message.error(`Доступно только ${formatMoney(available)}`);
    if (type === "transfer" && !toId) return message.error("Выберите, куда перенести");

    setSaving(true);
    try {
      await callApi("transferMoney", { type, fromId, toId: type === "transfer" ? toId : undefined, amount, month: currentMonthKey() });
      message.success(type === "transfer" ? "Деньги перенесены" : "Деньги списаны");
      onClose();
      onDone();
    } catch (error) {
      message.error(`Ошибка: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Перенести или списать" onCancel={onClose} onOk={save} okText="Выполнить" cancelText="Отмена" confirmLoading={saving} centered className="fit-modal" destroyOnHidden>
      <Form layout="vertical" requiredMark={false}>
        <Form.Item>
          <Radio.Group
            value={type}
            onChange={e => setType(e.target.value)}
            optionType="button"
            options={[
              { value: "transfer", label: "Перенести" },
              { value: "writeoff", label: "Списать (потратил)" }
            ]}
          />
        </Form.Item>
        <Form.Item label="Откуда">
          <Select
            value={fromId}
            onChange={v => { setFromId(v); if (v === toId) setToId(undefined); }}
            options={sources.map(s => ({ value: s.id, label: `${s.name} — ${formatMoney(s.balance)}` }))}
          />
        </Form.Item>
        {type === "transfer" && (
          <Form.Item label="Куда">
            <Select value={toId} onChange={setToId} placeholder="Выберите цель" options={targets} />
          </Form.Item>
        )}
        <Form.Item label="Сумма" extra={`Доступно: ${formatMoney(available)}`}>
          <MoneyInput min={1} max={available} value={amount} style={{ width: "100%" }} onChange={v => setAmount(v === null ? null : Number(v))} />
        </Form.Item>
      </Form>
      {closesTarget && <Alert type="success" showIcon message="С этим переносом цель будет достигнута и закроется." />}
    </Modal>
  );
}
