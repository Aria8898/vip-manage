import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const createSelectedAppPlugin = (appEntry: string): Plugin => {
  const virtualModuleId = "virtual:app-root";
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;

  return {
    name: "selected-app-entry",
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }

      return null;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) {
        return null;
      }

      return `export { default } from ${JSON.stringify(appEntry)};`;
    }
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const appKind = env.VITE_APP_KIND === "status" ? "status" : "admin";
  const appEntry =
    appKind === "status" ? "/src/apps/StatusApp.tsx" : "/src/apps/AdminApp.tsx";

  return {
    plugins: [react(), createSelectedAppPlugin(appEntry)],
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true
        }
      }
    }
  };
});
