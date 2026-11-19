export interface Goal {
  id: number | string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  monthStart: string;
  monthEnd: string;
  monthlyAmount: number;
  status: string;
  createdAt: string;
}

export interface MonthAmount {
  month: string;
  amount: number;
}

// Ответ getDepositPreview: одна запись на активную цель
export interface DepositPreviewGoal {
  goalId: number | string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  monthEnd: string;
  plannedAmount: number;
  currentMonthDeposits: number;
  previousMonthsDeposits: MonthAmount[];
}

// Подушка безопасности в окне внесения (не цель: без срока и суммы)
export interface DepositPreviewCushion {
  goalId: string;
  currentAmount: number;
  currentMonthDeposits: number;
  previousMonthsDeposits: MonthAmount[];
}

export interface DepositPreview {
  goals: DepositPreviewGoal[];
  cushion: DepositPreviewCushion;
}

export interface DepositSummary {
  month: string;
  totalPlanned: number;
  totalDeposited: number;
}

export const STATUS_COMPLETED = "Выполнена";

export interface BudgetMonth {
  month: string;
  income: number | null;
  incomeIsActual: boolean;
  settingIncome: number | null;
  baseExpenses: number;
  planned: number;
  deposited: number;
  // доход − базовые расходы − запланированное на активные цели; null, пока доход не задан
  free: number | null;
}

export interface BudgetOverview {
  configured: boolean;
  months: BudgetMonth[];
}
