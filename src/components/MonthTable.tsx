import { useEffect, useState } from "react";
import { Skeleton, Table, Tag, Typography } from "antd";
import { CalendarOutlined, CheckCircleFilled } from "@ant-design/icons";
import { callApi } from "../lib/api";
import { formatMoney, formatMonthLabel } from "../lib/format";

interface Cell {
  goalId: number | string;
  planned: number;
  deposited: number;
}
interface Row {
  month: string;
  income: number | null;
  cells: Cell[];
  cushion: number;
  totalDeposited: number;
  allDone: boolean;
}
interface Data {
  goals: { id: number | string; name: string; status: string }[];
  months: Row[];
  currentMonth: string;
}

// revision меняется после любых изменений данных — таблица загружается заново
export default function MonthTable({ revision }: { revision: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let current = true;
    callApi<Data>("getMonthTable").then(result => {
      if (!current) return;
      setData(result);
      setLoadFailed(false);
    }).catch(() => {
      if (current) setLoadFailed(true);
    });
    return () => { current = false; };
  }, [revision]);

  const columns = [
    {
      title: "Месяц",
      dataIndex: "month",
      fixed: "left" as const,
      width: 180,
      render: (month: string, row: Row) => (
        <>
          <b>{formatMonthLabel(month)}</b>{" "}
          {row.allDone && <CheckCircleFilled className="month-done" title="Все цели месяца выполнены" />}
          {month === data?.currentMonth && <Tag color="purple" className="current-month-tag">сейчас</Tag>}
        </>
      )
    },
    {
      title: "Доход",
      dataIndex: "income",
      align: "right" as const,
      render: (v: number | null) => (v === null ? "—" : formatMoney(v))
    },
    ...(data?.goals ?? []).map((goal, i) => ({
      title: goal.name,
      key: String(goal.id),
      align: "right" as const,
      render: (_: unknown, row: Row) => {
        const c = row.cells[i];
        if (!c || (!c.planned && !c.deposited)) return "—";
        const done = c.planned > 0 && c.deposited >= c.planned;
        return (
          <span>
            <Typography.Text type={done ? "success" : undefined}>{formatMoney(c.deposited)}</Typography.Text>
            {c.planned > 0 && <Typography.Text type="secondary"> / {formatMoney(c.planned)}</Typography.Text>}
          </span>
        );
      }
    })),
    {
      title: "Подушка",
      dataIndex: "cushion",
      align: "right" as const,
      render: (v: number) => (v ? formatMoney(v) : "—")
    },
    {
      title: "Всего внесено",
      dataIndex: "totalDeposited",
      align: "right" as const,
      render: (v: number) => <b>{formatMoney(v)}</b>
    }
  ];

  return (
    <section id="plan" className="dashboard-section" aria-labelledby="plan-title">
      <div className="section-header">
        <h2 id="plan-title">План по месяцам</h2>
        {!!data?.goals.length && <span className="muted">Внесено / план</span>}
      </div>
      {loadFailed ? (
        <div className="empty-panel" role="status">Не удалось загрузить план по месяцам.</div>
      ) : !data ? (
        <div className="empty-panel"><Skeleton active /></div>
      ) : data.goals.length === 0 ? (
        <div className="empty-panel plan-empty">
          <span className="icon-tile tone-lavender"><CalendarOutlined /></span>
          <p>Помесячный план появится после создания цели.</p>
        </div>
      ) : (
        <div className="month-panel">
          <Table<Row>
            rowKey="month"
            pagination={{ pageSize: 12, hideOnSinglePage: true }}
            dataSource={data.months}
            columns={columns}
            rowClassName={row => row.month === data.currentMonth ? "current-month-row" : ""}
            scroll={{ x: "max-content" }}
          />
        </div>
      )}
    </section>
  );
}
