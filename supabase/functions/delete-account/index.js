import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDeleteAccountHandler, createRateLimitStore } from './handler.js';

const handler = createDeleteAccountHandler({
  createClient,
  getConfig: () => ({
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }),
  // This prototype store is isolate-local. T162.4 must replace or validate
  // distributed enforcement before hosted production use.
  rateLimitStore: createRateLimitStore(),
});

Deno.serve(handler);
