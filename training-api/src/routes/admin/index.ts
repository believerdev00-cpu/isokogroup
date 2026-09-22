import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { applicationsRouter } from "./applications.js";
import { catalogRouter } from "./catalog.js";
import { certificatesRouter } from "./certificates.js";
import { classesRouter } from "./classes.js";
import { dashboardRouter } from "./dashboard.js";
import { financeRouter } from "./finance.js";
import { reportsRouter } from "./reports.js";
import { settingsRouter } from "./settings.js";
import { studentsRouter } from "./students.js";

// Every /api/admin route requires the admin role, checked before anything below runs.
export const adminRouter = Router();
adminRouter.use(requireRole("admin"));
for (const r of [dashboardRouter, catalogRouter, applicationsRouter, studentsRouter, classesRouter, financeRouter,
  certificatesRouter, reportsRouter, settingsRouter]) {
  adminRouter.use(r);
}
