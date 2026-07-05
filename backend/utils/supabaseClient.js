require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey || supabaseKey.includes('<your-') || supabaseKey === 'SUPABASE_SERVICE_KEY') {
    throw new Error(
        'Missing or invalid Supabase service role key. Set SUPABASE_URL and a real SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY in .env. ' +
        'Do not use the anon/public key here; use the service role or secret key when row-level security is enabled.'
    );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

module.exports = supabase;
