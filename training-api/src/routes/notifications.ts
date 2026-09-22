import { Router } from "express";
import { query } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const me = currentUser(req);
  const items = await query(
    "SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30",
    [me.id],
  );
  res.json({ data: { items, unread: items.filter((n) => !n.read_at).length } });
});

notificationsRouter.post("/read-all", async (req, res) => {
  const me = currentUser(req);
  await query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [me.id]);
  res.json({ data: { ok: true } });
});
