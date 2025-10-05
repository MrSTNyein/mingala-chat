// config.js

// This file reads the Supabase URL and key from environment variables.
// These are not committed to your Git repository, keeping your keys secure.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Supabase URL and Key must be set in your environment variables.");
}

export { SUPABASE_URL, SUPABASE_KEY };
