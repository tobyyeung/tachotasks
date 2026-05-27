import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Uses the direct connection for CLI operations like push and generate
    url: env("DIRECT_URL"),
  },
});