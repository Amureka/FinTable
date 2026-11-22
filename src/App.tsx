import { useCallback, useEffect, useState } from "react";
import { App as AntApp, Button, ConfigProvider, Popconfirm, Skeleton } from "antd";
import ruRU from "antd/locale/ru_RU";
import {
  AppstoreOutlined, ArrowDownOutlined, ArrowUpOutlined, CalendarOutlined,
  FundOutlined, AimOutlined, PlusOutlined, SafetyOutlined, SettingOutlined, SwapOutlined, WalletOutlined
} from "@ant-design/icons";
import CreateGoalModal from "./components/CreateGoalModal";
import DepositModal from "./components/DepositModal";
import GoalsDashboard from "./components/GoalsDashboard";
import { DeleteGoalModal, EditGoalModal, TransferModal } from "./components/GoalActionModals";
import MonthTable from "./components/MonthTable";
import BudgetCard from "./components/BudgetCard";
import BudgetSettingsModal from "./components/BudgetSettingsModal";
import { USE_MOCK, callApi, resetMockData } from "./lib/api";
import { currentMonthKey, formatMoney, formatMonthLabel } from "./lib/format";
import { BudgetOverview, Goal, STATUS_COMPLETED } from "./lib/types";

const navigation = [
  { id: "overview", label: "Обзор", icon: <AppstoreOutlined /> },
  { id: "budget", label: "Бюджет", icon: <WalletOutlined /> },
  { id: "goals", label: "Цели", icon: <AimOutlined /> },
  { id: "plan", label: "План по месяцам", shortLabel: "План", icon: <CalendarOutlined /> }
];

export default function App() {
  return (
    <ConfigProvider locale={ruRU} theme={{
      token: {
        colorPrimary: "#6843bf", colorLink: "#6843bf", colorText: "#201834", colorTextSecondary: "#665e77",
        colorSuccess: "#27785b", colorBorder: "#e7e1ef", colorBgLayout: "#f8f7fb",
        borderRadius: 10, fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
        controlHeight: 38
      },
      components: {
        Button: { fontWeight: 600, primaryShadow: "none", defaultShadow: "none" },
        Modal: { titleFontSize: 20 },
        Table: { headerBg: "#f7f4fb", headerColor: "#514462" }
      }
    }}>
      <AntApp component={false}><Dashboard /></AntApp>
    </ConfigProvider>
  );
}

function Dashboard() {
  const { message } = AntApp.useApp();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cushionAmount, setCushionAmount] = useState(0);
  const [budget, setBudget] = useState<BudgetOverview | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [budgetRevision, setBudgetRevision] = useState(0);
  const [activeSection, setActiveSection] = useState(() => window.location.hash.slice(1) || "overview");

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      setGoals(await callApi<Goal[]>("getGoals"));
    } catch (error) {
      message.error(`Не удалось загрузить цели: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadCushion = useCallback(async () => {
    try {
      const result = await callApi<{ amount: number }>("getCushion");
      setCushionAmount(result.amount);
    } catch (error) {
      message.error(`Не удалось загрузить подушку безопасности: ${(error as Error).message}`);
    }
  }, [message]);

  const loadBudget = useCallback(async () => {
    try {
      setBudget(await callApi<BudgetOverview>("getBudgetOverview", { months: [currentMonthKey()] }));
    } catch (error) {
      message.error(`Не удалось загрузить бюджет: ${(error as Error).message}`);
    } finally {
      setBudgetLoading(false);
    }
  }, [message]);

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

  useEffect(() => {
    const updateSection = () => setActiveSection(window.location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", updateSection);
    return () => window.removeEventListener("hashchange", updateSection);
  }, []);

  const currentBudgetMonth = budget?.months[0] ?? null;
  const savedTotal = goals.reduce((sum, goal) => sum + goal.currentAmount, 0) + cushionAmount;
  const activeGoals = goals.filter(goal => goal.status !== STATUS_COMPLETED).length;

  return (
    <>
      <div className="workspace">
        <aside className="sidebar">
          <a className="brand" href="#overview">
            <span className="brand-mark"><FundOutlined /></span>
            <span>Fin<span className="brand-accent">Table</span><small>Планер накоплений</small></span>
          </a>
          <nav className="navigation" aria-label="Разделы">
            {navigation.map(item => (
              <a key={item.id} href={`#${item.id}`} aria-label={item.label}
                aria-current={activeSection === item.id ? "location" : undefined}>
                {item.icon}
                <span className={item.shortLabel ? "nav-label-full" : undefined}>{item.label}</span>
                {item.shortLabel && <span className="nav-label-short">{item.shortLabel}</span>}
              </a>
            ))}
          </nav>
          <div className="sidebar-footer">
            <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>Настройки бюджета</Button>
            {USE_MOCK && (
              <div className="local-mode">
                <span className="local-status"><i />Тестовый режим</span>
                <p>Данные хранятся в этом браузере.</p>
                <Popconfirm title="Удалить все тестовые данные?" okText="Удалить" cancelText="Отмена" onConfirm={resetMockData}>
                  <Button type="link" size="small">Сбросить данные</Button>
                </Popconfirm>
              </div>
            )}
          </div>
        </aside>

        <main id="overview" className="dashboard">
          <header className="page-header">
            <div>
              <p className="page-date"><CalendarOutlined /> <span>{formatMonthLabel(currentMonthKey())}</span></p>
              <h1>Мои накопления</h1>
            </div>
            <div className="page-actions">
              <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Создать цель</Button>
              <Button type="primary" icon={<ArrowDownOutlined />} onClick={() => setDepositOpen(true)}>Внести деньги</Button>
            </div>
          </header>

          <div className="overview-grid">
            <section className="balance-card" aria-labelledby="balance-title">
              <div className="balance-art" aria-hidden="true">
                <span /><span /><span /><span />
                <ArrowUpOutlined />
              </div>
              <div className="balance-content">
                <h2 id="balance-title"><WalletOutlined /> Всего накоплено</h2>
                {loading ? <Skeleton.Input active size="large" /> : <p className="balance-amount">{formatMoney(savedTotal)}</p>}
                <p className="balance-detail">На всех целях и в резерве</p>
              </div>
              <div className="balance-footer"><AimOutlined /> Активные цели <strong>{loading ? "—" : activeGoals}</strong></div>
            </section>

            <section className="reserve-card" aria-labelledby="reserve-title">
              <span className="icon-tile reserve-icon"><SafetyOutlined /></span>
              <h2 id="reserve-title">Подушка безопасности</h2>
              {loading ? <Skeleton.Input active /> : <p className="reserve-amount">{formatMoney(cushionAmount)}</p>}
              <p className="muted">Резерв без срока для свободных средств.</p>
              <Button icon={<SwapOutlined />} onClick={() => setTransferFrom("cushion")}>Перенести / списать</Button>
            </section>
          </div>

          <BudgetCard configured={budget?.configured === true} month={currentBudgetMonth} loading={budgetLoading}
            onOpenSettings={() => setSettingsOpen(true)} onChanged={reloadAll} />
          <GoalsDashboard goals={goals} loading={loading} onCreateGoal={() => setCreateOpen(true)}
            onEdit={setEditGoal} onDelete={setDeleteGoal} onTransfer={setTransferFrom} />
          <MonthTable revision={budgetRevision} />

          {USE_MOCK && <p className="mobile-mode">
            Тестовый режим · данные хранятся в этом браузере
            <Popconfirm title="Удалить все тестовые данные?" okText="Удалить" cancelText="Отмена" onConfirm={resetMockData}>
              <Button type="link" size="small">Сбросить данные</Button>
            </Popconfirm>
          </p>}
        </main>
      </div>

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
    </>
  );
}
