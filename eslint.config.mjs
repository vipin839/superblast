import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not application source: archived code, the standalone worker, and
    // Playwright specs each have their own toolchain.
    "old_version_backup/**",
    "worker/**",
    "e2e/**",
    "infra/**",
    "scripts/**",
    "node_modules/**",
  ]),
]);

export default eslintConfig;
