import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { childrenRouter } from "./routes/children.js";
import { contentRouter } from "./routes/content.js";
import { assistantRouter } from "./routes/assistant.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.split(",") }));
  app.use(express.json({ limit: "100kb" }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300 }));

  // `assistant` tells the app whether to offer the optional AI helper at all.
  app.get("/api/health", (_req, res) => res.json({ ok: true, assistant: Boolean(config.anthropicKey) }));
  app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 30 }), authRouter);
  app.use("/api/children", childrenRouter);
  app.use("/api", contentRouter);
  app.use("/api/assistant", assistantRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
