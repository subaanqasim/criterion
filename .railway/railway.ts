import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  const database = postgres("Postgres", { region: "us-west2" });
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });
  const api = service("api", {
    source: github("subaanqasim/criterion", {
      branch: "main",
      rootDirectory: "api-service",
    }),
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build",
    },
    start: "pnpm start",
    preDeploy: "pnpm db:migrate",
    healthcheck: "/health",
    healthcheckTimeout: 300,
    deploy: {
      restartPolicyMaxRetries: 5,
    },
    replicas: { "us-west2": 1 },
    domains: [{ domain: "search.sunnah-stories.com", port: 8080 }],
    env: {
      CRITERION_API_KEY: preserve(),
      GOOGLE_GENERATIVE_AI_API_KEY: preserve(),
      NODE_ENV: "production",
      POSTGRES_URL: database.env.DATABASE_URL,
    },
  });

  return project("criterion-api", {
    resources: [database, api, postgresVolume],
  });
});
