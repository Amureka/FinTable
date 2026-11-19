import dayjs from "dayjs";

export function formatMoney(amount: number | null | undefined): string {
  return `${Number(amount || 0).toLocaleString("ru-RU")} ₽`;
}

// "2026-11" -> "ноябрь 2026"
export function formatMonthLabel(monthKeyValue: string): string {
  return dayjs(`${monthKeyValue}-01`).format("MMMM YYYY");
}

export function currentMonthKey(): string {
  return dayjs().format("YYYY-MM");
}
