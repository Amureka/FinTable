import { useEffect, useState } from "react";
import { Card, Table, Tag, Typography } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
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

  useEffect(() => {
    callApi<Data>("getMonthTable").then(setData).catch(() => setData(null));
  }, [revision]);

  if (!data || data.goals.length === 0) return null;

  const columns = [
    {
      title: "Месяц",
      dataIndex: "month",
      fixed: "left" as const,
      width: 150,
      render: (month: string, row: Row) => (
        <>
          <b>{formatMonthLabel(month)}</b>{" "}
          {row.allDone && <CheckCircleFilled style={{ color: "#52c41a" }} title="Все цели месяца выполнены" />}
          {month === data.currentMonth && <Tag style={{ marginLeft: 4 }}>сейчас</Tag>}
        </>
      )
    },
    {
      title: "Доход",
      dataIndex: "income",
      align: "right" as const,
      render: (v: number | null) => (v === null ? "—" : formatMoney(v))
    },
    ...data.goals.map((goal, i) => ({
      title: goal.name,
      key: String(goal.id),
      align: "right" as const,
      render: (_: unknown, row: Row) => {
        const c = row.cells[i];
        if (!c.planned && !c.deposited) return "—";
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
    <Card title="Таблица по месяцам" style={{ marginTop: 16 }} extra={<Typography.Text type="secondary">внесено / план</Typography.Text>}>
      <Table<Row>
        size="small"
        rowKey="month"
        pagination={{ pageSize: 12, hideOnSinglePage: true }}
        dataSource={data.months}
        columns={columns}
        scroll={{ x: "max-content" }}
      />
    </Card>
  );
}
