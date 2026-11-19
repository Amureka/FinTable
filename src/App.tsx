import { useCallback, useEffect, useState } from "react";
import { Alert, Button, ConfigProvider, Layout, Popconfirm, Space, Typography, message } from "antd";
import ruRU from "antd/locale/ru_RU";
import { PlusOutlined, SwapOutlined, WalletOutlined } from "@ant-design/icons";
import CreateGoalModal from "./components/CreateGoalModal";
import DepositModal from "./components/DepositModal";
import GoalsDashboard from "./components/GoalsDashboard";
import { DeleteGoalModal, EditGoalModal, TransferModal } from "./components/GoalActionModals";
import BudgetCard from "./components/BudgetCard";
import BudgetSettingsModal from "./components/BudgetSettingsModal";
import { USE_MOCK, callApi, resetMockData } from "./lib/api";
import { currentMonthKey } from "./lib/format";
import { BudgetOverview, Goal } from "./lib/types";

export default function App() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cushionAmount, setCushionAmount] = useState(0);
  const [budget, setBudget] = useState<BudgetOverview | null>(null);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [budgetRevision, setBudgetRevision] = useState(0);

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

  const loadCushion = useCallback(async () => {
    try {
      const result = await callApi<{ amount: number }>("getCushion");
      setCushionAmount(result.amount);
    } catch (error) {
      message.error(`Не удалось загрузить подушку безопасности: ${(error as Error).message}`);
    }
  }, []);

  const loadBudget = useCallback(async () => {
    try {
      setBudget(await callApi<BudgetOverview>("getBudgetOverview", { months: [currentMonthKey()] }));
    } catch (error) {
      message.error(`Не удалось загрузить бюджет: ${(error as Error).message}`);
    }
  }, []);

  // Цели и бюджет зависят друг от друга (план целей уменьшает свободные деньги)
  const reloadAll = useCallback(() => {
    loadGoals();
    loadBudget();
    loadCushion();
    setBudgetRevision(value => value + 1);
  }, [loadGoals, loadBudget, loadCushion]);

  useEffect(() => {
    loadGoals();
    loadBudget();
    loadCushion();
  }, [loadGoals, loadBudget, loadCushion]);

  const currentBudgetMonth = budget?.months[0] ?? null;

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
            <Button icon={<SwapOutlined />} onClick={() => setTransferFrom("cushion")}>
              Перенести / списать
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

          <BudgetCard
            configured={budget?.configured === true}
            month={currentBudgetMonth}
            loading={budget === null}
            onOpenSettings={() => setSettingsOpen(true)}
            onChanged={reloadAll}
          />

          <GoalsDashboard goals={goals} cushionAmount={cushionAmount} loading={loading} onCreateGoal={() => setCreateOpen(true)}
            onEdit={setEditGoal}
            onDelete={setDeleteGoal}
            onTransfer={setTransferFrom}
          />
        </Layout.Content>
      </Layout>

      <CreateGoalModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reloadAll}
        onOpenBudgetSettings={() => setSettingsOpen(true)}
        budgetRevision={budgetRevision}
      />
      <EditGoalModal goal={editGoal} onClose={() => setEditGoal(null)} onDone={reloadAll} />
      <DeleteGoalModal goal={deleteGoal} goals={goals} onClose={() => setDeleteGoal(null)} onDone={reloadAll} />
      <TransferModal
        open={transferFrom !== null}
        goals={goals}
        cushionAmount={cushionAmount}
        initialFromId={transferFrom ?? undefined}
        onClose={() => setTransferFrom(null)}
        onDone={reloadAll}
      />
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} onSaved={reloadAll} />
      <BudgetSettingsModal
        open={settingsOpen}
        initialIncome={currentBudgetMonth?.settingIncome ?? null}
        initialExpenses={currentBudgetMonth?.baseExpenses ?? 0}
        onClose={() => setSettingsOpen(false)}
        onSaved={reloadAll}
      />
    </ConfigProvider>
  );
}
