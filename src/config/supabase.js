import { createClient } from "@supabase/supabase-js";
import env from "./env.js";

/**
 * supabaseAdmin — service_role client.
 * Bypasses RLS. Use ONLY for system-level operations:
 * LPR, serial triggers, cron jobs, webhooks.
 * NEVER expose this client or its key to the frontend.
 */
const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseKey);

/**
 * createUserClient(token) — anon-key client that forwards the user's JWT.
 * Supabase RLS evaluates auth.uid() from this token automatically.
 * Use for endpoints where the request comes from an authenticated panel/mobile user.
 *
 * @param {string} token - Bearer token from Authorization header
 * @returns Supabase client scoped to that user
 */
export function createUserClient(token) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}

// Default export kept as the admin client for backward compatibility
// with all existing module imports: `import supabase from '...'`
export { supabaseAdmin as default };
