import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "database",
          include: ["supabase/tests/**/*.test.ts"],
          globalSetup: ["supabase/tests/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
    ],
  },
});
