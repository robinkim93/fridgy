import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { Showcase } from "./ui/Showcase";
import "./index.css";

const queryClient = new QueryClient();

// 디자인 시스템 스타일 가이드: /?showcase (프로덕션 경로 아님)
const isShowcase = new URLSearchParams(window.location.search).has("showcase");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isShowcase ? <Showcase /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>
);
