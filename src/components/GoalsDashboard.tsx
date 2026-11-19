import { Button, Card, Col, Empty, Progress, Row, Statistic, Tag, Typography } from "antd";
import { formatMoney, formatMonthLabel } from "../lib/format";
import { Goal, STATUS_COMPLETED } from "../lib/types";

interface Props {
  goals: Goal[];
  loading: boolean;
  onCreateGoal: () => void;
}

export default function GoalsDashboard({ goals, loading, onCreateGoal }: Props) {
  const savedTotal = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);

  return (
    <>
      <Card loading={loading} style={{ marginBottom: 16 }}>
        <Statistic title="В копилке" value={savedTotal} suffix="₽" groupSeparator=" " />
      </Card>

      {!loading && goals.length === 0 ? (
        <Card>
          <Empty description="Целей пока нет">
            <Button type="primary" onClick={onCreateGoal}>
              Создать цель
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {goals.map(goal => {
            const percent = goal.targetAmount > 0 ? Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100) : 0;
            const completed = goal.status === STATUS_COMPLETED;

            return (
              <Col key={String(goal.id)} xs={24} md={12} xl={8}>
                <Card
                  title={goal.name}
                  loading={loading}
                  extra={completed ? <Tag color="success">Выполнена</Tag> : <Tag color="processing">Активна</Tag>}
                >
                  <Progress percent={percent} status={completed ? "success" : "active"} />

                  <Row gutter={16} style={{ marginTop: 12 }}>
                    <Col span={12}>
                      <Statistic title="Накоплено" value={goal.currentAmount} suffix="₽" groupSeparator=" " valueStyle={{ fontSize: 18 }} />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Осталось"
                        value={Math.max(goal.targetAmount - goal.currentAmount, 0)}
                        suffix="₽"
                        groupSeparator=" "
                        valueStyle={{ fontSize: 18 }}
                      />
                    </Col>
                  </Row>

                  <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                    {formatMonthLabel(goal.monthStart)} — {formatMonthLabel(goal.monthEnd)}, цель {formatMoney(goal.targetAmount)}
                  </Typography.Paragraph>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </>
  );
}
