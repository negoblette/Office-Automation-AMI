import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Hardening Tahap 4: SQL mentah dari string rawan SQL injection — pakai $queryRaw`…` / $executeRaw`…` (parameter otomatis).
  {
    ignores: ["src/test/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        { property: "$queryRawUnsafe", message: "Rawan SQL injection: pakai $queryRaw`…` dengan parameter (hardening Tahap 4)." },
        { property: "$executeRawUnsafe", message: "Rawan SQL injection: pakai $executeRaw`…` dengan parameter (hardening Tahap 4)." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
