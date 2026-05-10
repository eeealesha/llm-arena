import { createClient } from "@supabase/supabase-js"

// Set these in .env.local:
// NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
// SUPABASE_SERVICE_ROLE_KEY=eyJ...

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabase =
  url && key ? createClient(url, key) : null
