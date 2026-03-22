import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "interface-api-util-test",
  cacheFolder: ".antelope/cache",
  modules: {
    api: {
      source: {
        type: "local",
        path: "../api",
        installCommand: ["pnpm install", "npx tsc"],
      },
      config: {
        servers: [{ protocol: "http", host: "127.0.0.1", port: 5010 }],
      },
    },
  },
  test: {
    folder: "dist/tests",
  },
});
