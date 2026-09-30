import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    env: { TZ: "Asia/Jakarta" },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
          exclude: ["**/*.db.test.ts"],
        },
      },
      {
        // Test yang memakai PostgreSQL sungguhan (database *_test, butuh `docker compose up -d`).
        extends: true,
        test: {
          name: "db",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["./vitest.db-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
