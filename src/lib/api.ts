// Обращение к серверу. В тестовом режиме вызывает Code.gs прямо в браузере
// (его запускает эмулятор Google Apps Script), иначе — реальный Apps Script по URL.

declare global {
  interface Window {
    doPost?: (e: { parameter: { data: string } }) => { getContent(): string };
    resetMockSpreadsheet?: () => void;
  }
}

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
const API_URL: string = import.meta.env.VITE_API_URL ?? "";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.appendChild(script);
  });
}

// Подключает эмулятор Google Apps Script и серверный код (по порядку)
export async function loadMockBackend(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  await loadScript(`${base}mock/gas-runtime.js`);
  await loadScript(`${base}mock/Code.gs.js`);
}

export function resetMockData(): void {
  window.resetMockSpreadsheet?.();
}

export async function callApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const body = JSON.stringify({ action, ...payload });
  let result: unknown;

  if (USE_MOCK) {
    if (!window.doPost) throw new Error("Тестовый сервер не загружен");
    result = JSON.parse(window.doPost({ parameter: { data: body } }).getContent());
  } else {
    if (!API_URL) throw new Error("Не задан VITE_API_URL");
    const formData = new FormData();
    formData.append("data", body);
    const response = await fetch(API_URL, { method: "POST", body: formData });
    result = await response.json();
  }

  const failure = result as { success?: boolean; error?: string; message?: string } | null;
  if (failure && failure.success === false) {
    throw new Error(failure.error || failure.message || "Ошибка сервера");
  }

  return result as T;
}
