import { App as AntApp, ConfigProvider, theme as antTheme } from "antd";
import itIT from "antd/locale/it_IT";
import type { ReactNode } from "react";
import { useUiStore } from "./store/uiStore";

/**
 * ConfigProvider Ant Design legato al tema (chiaro/scuro) dello store UI.
 * Avvolge anche <App> di AntD per fornire il contesto a message/notification/Modal.
 */
// Stesso indaco delle custom property --primary di app.css (chiaro/scuro):
// tiene i controlli Ant Design (Select, Slider, Checkbox…) allineati
// all'accento dei controlli custom (bottoni, tab, badge) nello stesso tema.
const PRIMARY_BY_THEME = { light: "#4f46e5", dark: "#7c84ff" } as const;

export function ThemedConfigProvider({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  return (
    <ConfigProvider
      locale={itIT}
      theme={{
        algorithm:
          theme === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: PRIMARY_BY_THEME[theme],
          fontFamily:
            "'Hanken Grotesk', system-ui, -apple-system, sans-serif",
          borderRadius: 8,
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
