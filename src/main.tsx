import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemedConfigProvider } from "./ThemedConfigProvider";
import { App as AppRoot } from "./App";
import "./styles/app.css";
import "./styles/overrides.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ThemedConfigProvider>
          <AppRoot />
        </ThemedConfigProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
