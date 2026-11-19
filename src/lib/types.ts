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
  plannedAmount: number;
  currentMonthDeposits: number;
  previousMonthsDeposits: MonthAmount[];
}

export interface DepositSummary {
  month: string;
  totalPlanned: number;
  totalDeposited: number;
}

export const STATUS_COMPLETED = "Выполнена";
