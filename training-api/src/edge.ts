// Entry point of the Supabase Edge Function "training". `npm run build` bundles
// this into supabase/functions/training/index.js; the runtime's Node compatibility
// serves the Express app, and requests arrive under /training/...
import { createApp } from "./app.js";

createApp().listen(8000);
