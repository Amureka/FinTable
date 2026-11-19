import { useEffect, useState } from "react";
import { Form, Modal, Typography, message } from "antd";
import { callApi } from "../lib/api";
import MoneyInput from "./MoneyInput";

interface Props {
  open: boolean;
  initialIncome: number | null;
  initialExpenses: number;
  onClose: () => void;
  onSaved: () => void;
}

interface Values {
  monthlyIncome: number | null;
  baseExpenses: number | null;
}

export default function BudgetSettingsModal({ open, initialIncome, initialExpenses, onClose, onSaved }: Props) {
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) form.setFieldsValue({ monthlyIncome: initialIncome, baseExpenses: initialExpenses });
  }, [open, initialIncome, initialExpenses, form]);

  async function handleSave() {
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    try {
      await callApi("saveBudgetSettings", {
        monthlyIncome: values.monthlyIncome,
        baseExpenses: values.baseExpenses ?? 0
      });
      message.success("Настройки сохранены");
      onSaved();
      onClose();
    } catch (error) {
      message.error(`Ошибка сохранения: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Настройки бюджета"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={saving}
      centered
      className="fit-modal"
      destroyOnClose
    >
      <Typography.Paragraph type="secondary">
        Доход и расходы действуют с текущего месяца и на будущее. Сколько получено в конкретном месяце, можно поправить на главном экране.
      </Typography.Paragraph>

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item label="Доход в месяц" name="monthlyIncome" rules={[{ required: true, message: "Укажите доход" }]}>
          <MoneyInput min={0} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Базовые расходы в месяц (еда, коммунальные платежи и т.д.)" name="baseExpenses">
          <MoneyInput min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
