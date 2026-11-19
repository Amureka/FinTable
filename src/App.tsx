import { useCallback, useEffect, useState } from "react";
import { Alert, Button, ConfigProvider, Layout, Popconfirm, Space, Typography, message } from "antd";
import ruRU from "antd/locale/ru_RU";
import { PlusOutlined, WalletOutlined } from "@ant-design/icons";
import CreateGoalModal from "./components/CreateGoalModal";
import DepositModal from "./components/DepositModal";
import GoalsDashboard from "./components/GoalsDashboard";
import { USE_MOCK, callApi, resetMockData } from "./lib/api";
import { Goal } from "./lib/types";

export default function App() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      setGoals(await callApi<Goal[]>("getGoals"));
    } catch (error) {
      message.error(`Не удалось загрузить цели: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  return (
    <ConfigProvider locale={ruRU}>
      <Layout style={{ minHeight: "100vh" }}>
        <Layout.Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", height: "auto", padding: "12px 24px" }}>
          <Typography.Title level={3} style={{ color: "#fff", margin: 0 }}>
            FinTable
          </Typography.Title>

          <Space wrap>
            <Button type="primary" icon={<WalletOutlined />} onClick={() => setDepositOpen(true)}>
              Внести деньги
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Создать цель
            </Button>
          </Space>
        </Layout.Header>

        <Layout.Content style={{ padding: 24, maxWidth: 1200, width: "100%", margin: "0 auto" }}>
          {USE_MOCK && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Тестовый режим: данные хранятся только в этом браузере, Google Таблица не используется."
              action={
                <Popconfirm title="Удалить все тестовые данные?" okText="Удалить" cancelText="Отмена" onConfirm={resetMockData}>
                  <Button size="small">Сбросить данные</Button>
                </Popconfirm>
              }
            />
          )}

          <GoalsDashboard goals={goals} loading={loading} onCreateGoal={() => setCreateOpen(true)} />
        </Layout.Content>
      </Layout>

      <CreateGoalModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={loadGoals} />
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} onSaved={loadGoals} />
    </ConfigProvider>
  );
}
