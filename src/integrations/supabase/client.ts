// Supabase client — reads VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
// from the environment. If they're missing we boot a visible setup screen
// instead of crashing the whole app at import time (previous behavior).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // Loud in dev so the developer notices; silent in prod (the UI surface
  // in App.tsx already tells the operator what to do).
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL and/or VITE_SUPABASE_PUBLISHABLE_KEY are not set. ' +
    'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

// Create a real client when configured; otherwise export a placeholder that
// any call on will throw a clear message. App.tsx renders a setup screen
// before we get to a place that would invoke it, so this is defense-in-depth.
function stub(): SupabaseClient<Database> {
  const err = (): never => {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env file.',
    );
  };
  return new Proxy({} as SupabaseClient<Database>, {
    get() { return err; },
    apply() { return err(); },
  });
}

export const supabase: SupabaseClient<Database> = isSupabaseConfigured
  ? createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : stub();
