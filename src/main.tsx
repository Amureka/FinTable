import React from "react";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import App from "./App";
import { USE_MOCK, loadMockBackend } from "./lib/api";
import "./styles.css";

dayjs.locale("ru");

async function start() {
  if (USE_MOCK) await loadMockBackend();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

start();
