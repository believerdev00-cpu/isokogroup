// Local development under Node: `npm run dev` serves the API on http://localhost:4100/api.
// In production the same app runs as the Supabase Edge Function in src/edge.ts.
import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { runJobsSoon } from "./jobs.js";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Isoko Training Center API on http://localhost:${config.port}/api`);
});

runJobsSoon();
const timer = setInterval(runJobsSoon, 15 * 1000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
