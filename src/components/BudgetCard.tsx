import { useState } from "react";
import { Alert, Button, Card, Col, Popover, Row, Space, Statistic, Tag, message } from "antd";
import { EditOutlined, SettingOutlined } from "@ant-design/icons";
import { callApi } from "../lib/api";
import { currentMonthKey } from "../lib/format";
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveActualIncome() {
    if (draft === null || draft === undefined) return;

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

  if (!loading && !configured) {
    return (
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Укажите доход, и при создании целей будет видно, сколько денег ещё можно распределить."
        action={
          <Button size="small" type="primary" onClick={onOpenSettings}>
            Указать доход
          </Button>
        }
      />
    );
  }

  const free = month?.free ?? null;

  return (
    <Card
      loading={loading}
      title="Бюджет этого месяца"
      style={{ marginBottom: 16 }}
      extra={
        <Button size="small" icon={<SettingOutlined />} onClick={onOpenSettings}>
          Настройки
        </Button>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Statistic
            title={
              <Space size={4}>
                Доход
                <Popover
                  trigger="click"
                  overlayClassName="income-popover"
                  afterOpenChange={opened => {
                    // Фокус в поле и выделение текста, чтобы новая сумма заменяла старую
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
                      <MoneyInput
                        min={0}
                        value={draft}
                        onFocus={event => event.target.select()}
                        onChange={value => setDraft(value as number | null)}
                      />
                      <Button type="primary" size="small" loading={saving} onClick={saveActualIncome} disabled={draft === null}>
                        Сохранить
                      </Button>
                    </Space>
                  }
                >
                  <Button type="text" size="small" icon={<EditOutlined />} aria-label="Изменить доход за месяц" />
                </Popover>
              </Space>
            }
            value={month?.income ?? 0}
            suffix="₽"
            groupSeparator=" "
          />
          {month?.incomeIsActual && <Tag>изменён вручную</Tag>}
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="Базовые расходы" value={month?.baseExpenses ?? 0} suffix="₽" groupSeparator=" " />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="Запланировано на цели" value={month?.planned ?? 0} suffix="₽" groupSeparator=" " />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="Можно распределить"
            value={free ?? 0}
            suffix="₽"
            groupSeparator=" "
            valueStyle={{ color: free !== null && free < 0 ? "#cf1322" : "#389e0d" }}
          />
        </Col>
      </Row>
    </Card>
  );
}

