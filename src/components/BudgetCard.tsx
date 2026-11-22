import { useState } from "react";
import { App, Button, Popover, Skeleton, Space } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, AimOutlined, EditOutlined, SettingOutlined, WalletOutlined } from "@ant-design/icons";
import { callApi } from "../lib/api";
import { currentMonthKey, formatMoney } from "../lib/format";
import { BudgetMonth } from "../lib/types";
import MoneyInput from "./MoneyInput";

interface Props {
  configured: boolean;
  month: BudgetMonth | null;
  loading: boolean;
  onOpenSettings: () => void;
  onChanged: () => void;
}

export default function BudgetCard({ configured, month, loading, onOpenSettings, onChanged }: Props) {
  const { message } = App.useApp();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveActualIncome() {
    if (draft === null) return;
    setSaving(true);
    try {
      await callApi("saveMonthIncome", { month: currentMonthKey(), actualIncome: draft });
      message.success("Доход за месяц обновлён");
      setPopoverOpen(false);
      onChanged();
    } catch (error) {
      message.error(`Ошибка сохранения: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const metrics = [
    { title: "Доход", amount: month?.income, icon: <ArrowDownOutlined />, tone: "mint" },
    { title: "Базовые расходы", amount: month?.baseExpenses, icon: <ArrowUpOutlined />, tone: "peach" },
    { title: "План на цели", amount: month?.planned, icon: <AimOutlined />, tone: "lavender" },
    { title: "Можно распределить", amount: month?.free, icon: <WalletOutlined />, tone: "blue" }
  ];

  return (
    <section id="budget" className="dashboard-section" aria-labelledby="budget-title">
      <div className="section-header">
        <h2 id="budget-title">Бюджет месяца</h2>
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>{configured ? "Настройки" : "Указать доход"}</Button>
      </div>
      {!loading && !configured && (
        <p className="section-hint">Укажите доход, чтобы увидеть, сколько можно отложить на цели.</p>
      )}
      <div className="budget-grid">
        {metrics.map((metric, index) => (
          <div className="metric-card" key={metric.title}>
            <div className="metric-top">
              <span className={`icon-tile tone-${metric.tone}`}>{metric.icon}</span>
              {index === 0 && configured && (
                <Popover
                  trigger="click"
                  classNames={{ root: "income-popover" }}
                  afterOpenChange={opened => {
                    if (!opened) return;
                    const input = document.querySelector<HTMLInputElement>(".income-popover input");
                    input?.focus();
                    input?.select();
                  }}
                  open={popoverOpen}
                  onOpenChange={open => {
                    setPopoverOpen(open);
                    if (open) setDraft(month?.income ?? null);
                  }}
                  title="Сколько получено в этом месяце"
                  content={
                    <Space direction="vertical">
                      <MoneyInput min={0} value={draft} onChange={value => setDraft(value as number | null)} />
                      <Button type="primary" size="small" loading={saving} onClick={saveActualIncome} disabled={draft === null}>
                        Сохранить
                      </Button>
                    </Space>
                  }
                >
                  <Button type="text" size="small" icon={<EditOutlined />} aria-label="Изменить доход за месяц" />
                </Popover>
              )}
            </div>
            <h3>{metric.title}</h3>
            {loading ? <Skeleton.Input active size="small" /> : (
              <p className={index === 3 && (metric.amount ?? 0) < 0 ? "metric-amount negative" : "metric-amount"}>
                {metric.amount == null ? "—" : formatMoney(metric.amount)}
              </p>
            )}
            {index === 0 && month?.incomeIsActual && <span className="metric-note">Изменён вручную</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
