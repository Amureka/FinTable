# FinTable

Планирование накоплений на крупные цели. Интерфейс на Ant Design (React + Vite).

## Режимы данных
- **Тестовый (по умолчанию, `VITE_USE_MOCK=true`)**: серверный код `backend/Code.gs` выполняется прямо в браузере поверх эмулятора Google Apps Script, данные лежат в localStorage этого браузера. Google Таблица не нужна, на другом устройстве данных не будет.
- **Реальная таблица (`VITE_USE_MOCK=false`, `VITE_API_URL=<url развёртывания Apps Script>`)**: `backend/Code.gs` вставляется в Apps Script, привязанный к таблице. Листы и заголовки колонок описаны в `SHEET_HEADERS` вверху файла. Листы `BudgetSettings` и `MonthIncome` (доход и расходы) создаются автоматически. Подушка безопасности отдельного листа не требует: её взносы лежат в `GoalDeposits` с `goalId = cushion`. После обновления `Code.gs` создайте новую версию развёртывания Apps Script. Не публикуйте URL развёртывания в открытом репозитории.

## Команды
```
npm ci
npm run dev      # локальный запуск
npm test         # тесты расчёта плана
npm run build    # сборка в dist/
```

## Android

[Сборка APK для установки на устройство](android/README.md).

## Публикация
Сайт собирается и публикуется на GitHub Pages workflow-ом `.github/workflows/deploy.yml` при каждом пуше в `main`.
Включить один раз: Settings → Pages → Source: **GitHub Actions**.

## Структура
- `src/lib/plan.ts` — расчёт плана накоплений (чистые функции, тесты рядом)
- `src/lib/api.ts` — вызовы сервера (тестовый и реальный режим)
- `src/components/` — окна «Создать цель», «Внести деньги», дашборд
- `backend/Code.gs` — серверная часть Apps Script
- `public/mock/gas-runtime.js` — эмулятор Apps Script для тестового режима
