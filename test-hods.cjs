const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data } = await supabaseAdmin.from('hod_profiles').select('department_name');
    console.log(data);
})();
