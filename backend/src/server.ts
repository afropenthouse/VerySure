import { buildApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
const app = await buildApp();
try {
  await db.$connect();
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  await db.$disconnect();
  process.exit(1);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
