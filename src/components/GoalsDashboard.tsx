import { Button, Dropdown, Skeleton } from "antd";
import { AimOutlined, CalendarOutlined, CheckOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { formatMoney, formatMonthLabel } from "../lib/format";
import { Goal, STATUS_COMPLETED } from "../lib/types";

interface Props {
  goals: Goal[];
  loading: boolean;
  onCreateGoal: () => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onTransfer: (fromId: string) => void;
}

export default function GoalsDashboard({ goals, loading, onCreateGoal, onEdit, onDelete, onTransfer }: Props) {
  return (
    <section id="goals" className="dashboard-section" aria-labelledby="goals-title">
      <div className="section-header">
        <h2 id="goals-title">Цели накоплений {!loading && goals.length > 0 && <span className="section-count">{goals.length}</span>}</h2>
      </div>
      {loading && goals.length === 0 && <div className="empty-panel"><Skeleton active /></div>}
      {!loading && goals.length === 0 && (
        <div className="empty-panel goals-empty">
          <div className="empty-icon"><AimOutlined /></div>
          <div>
            <h3>Первая цель</h3>
            <p>Задайте сумму и срок, чтобы получить план накоплений.</p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateGoal}>Создать цель</Button>
        </div>
      )}
      {goals.length > 0 && (
        <div className="goals-grid">
          {goals.map(goal => {
            const completed = goal.status === STATUS_COMPLETED;
            const percent = completed ? 100 : goal.targetAmount > 0
              ? Math.max(0, Math.min(100, Math.round(goal.currentAmount / goal.targetAmount * 100))) : 0;
            const id = String(goal.id);
            return (
              <article className="goal-card" key={id}>
                <div className="goal-header">
                  <span className={`icon-tile ${completed ? "tone-mint" : "tone-lavender"}`}>
                    {completed ? <CheckOutlined /> : <AimOutlined />}
                  </span>
                  <span className={`goal-status${completed ? " completed" : ""}`}>{completed ? "Выполнена" : "Активна"}</span>
                  <Dropdown trigger={["click"]} menu={{
                    items: [
                      { key: "edit", label: "Изменить", disabled: completed },
                      { key: "transfer", label: "Перенести / списать", disabled: goal.currentAmount <= 0 },
                      { key: "delete", label: "Удалить", danger: true }
                    ],
                    onClick: ({ key }) => {
                      if (key === "edit") onEdit(goal);
                      if (key === "transfer") onTransfer(id);
                      if (key === "delete") onDelete(goal);
                    }
                  }}>
                    <Button type="text" icon={<MoreOutlined />} aria-label={`Действия с целью «${goal.name}»`} />
                  </Dropdown>
                </div>
                <h3>{goal.name}</h3>
                <div className="goal-amount"><strong>{formatMoney(goal.currentAmount)}</strong> <span>из {formatMoney(goal.targetAmount)}</span></div>
                <div className="goal-progress-row">
                  <progress aria-label={`Прогресс цели «${goal.name}»`} className={completed ? "completed" : ""} value={percent} max={100} />
                  <span>{percent}%</span>
                </div>
                <div className="goal-detail">
                  <span>Осталось {formatMoney(Math.max(goal.targetAmount - goal.currentAmount, 0))}</span>
                  {goal.repeatMonths ? <span>Повтор через {goal.repeatMonths} мес.</span> : null}
                </div>
                <p className="goal-date"><CalendarOutlined /> {formatMonthLabel(goal.monthStart)} — {formatMonthLabel(goal.monthEnd)}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
