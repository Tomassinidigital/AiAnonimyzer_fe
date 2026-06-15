import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// React 19 + React Compiler (stabile) via babel-plugin-react-compiler.
// Il compiler memoizza automaticamente componenti e hook: niente useMemo/
// useCallback manuali nella maggior parte dei casi.
//
// `base`: prefisso del path degli asset. Per GitHub Pages (project site servito
// sotto /<repo>/) va impostato via VITE_BASE_PATH (lo fa il workflow di deploy).
// In locale resta "/".
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
});
