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
    env: {
      TZ: "Asia/Jakarta",
      // Kunci enkripsi KHUSUS TEST (hardening Tahap 4) — bukan kunci dev/produksi, sengaja tertulis di sini.
      DATA_ENCRYPTION_KEYS: "t1:97vp7Hh7qnleT4Tsuv6gXvf3hu8qL8zVyg+BN6LiQTU=",
      DATA_INDEX_KEY: "V8c7AeE616Y1fXmxFEspx3SovNYiDFeQbOpuyxCcmaE=",
    },
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
