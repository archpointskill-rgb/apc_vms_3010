import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { authenticate, currentUser } from "./auth/middleware";
import type { TokenVerifier } from "./auth/verifier";
import type { Db } from "./db";
import { allowedActions } from "./domain/Permissions";
import { AppError } from "./lib/errors";
import { appointmentRoutes } from "./routes/appointments";
import { contactRoutes } from "./routes/contacts";
import { masterRoutes } from "./routes/masters";
import { reportRoutes } from "./routes/reports";
import { staffRoutes } from "./routes/staff";
import { prRoutes } from "./routes/pr";
import { notificationRoutes, visitRoutes } from "./routes/visits";

export function createApp(db: Db, verifier: TokenVerifier, corsOrigins: string[]) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  const signedIn = authenticate(db, verifier);

  /** Who am I, and what may I do? The screens build their menu from this. */
  app.get("/api/me", signedIn, (req, res) => {
    const user = currentUser(req);
    res.json({ user, actions: allowedActions(user.role) });
  });

  app.use("/api/contacts", signedIn, contactRoutes(db));
  app.use("/api/visits", signedIn, visitRoutes(db));
  app.use("/api/appointments", signedIn, appointmentRoutes(db));
  app.use("/api/notifications", signedIn, notificationRoutes(db));
  app.use("/api/pr", signedIn, prRoutes(db));
  app.use("/api/staff", signedIn, staffRoutes(db));
  app.use("/api", signedIn, masterRoutes(db));
  app.use("/api", signedIn, reportRoutes(db));

  app.use("/api", (_req, res) => res.status(404).json({ error: "That address does not exist." }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message, ...(err.extra ?? {}) });
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return res.status(400).json({ error: `Check the ${first?.path.join(".") || "details"} field: ${first?.message ?? "it is not valid"}.` });
    }
    console.error("[api] unexpected error:", err);
    res.status(500).json({ error: "Something went wrong at our end. Please try again." });
  });

  return app;
}
