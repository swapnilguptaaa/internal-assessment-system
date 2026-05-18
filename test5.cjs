const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { error } = await supabaseAdmin.from('batches').select('*').eq('department_name', undefined);
    console.log("dep name undefined:", error?.message);
    const { error: e2 } = await supabaseAdmin.from('class_enrollments').select('*').eq('class_id', undefined);
    console.log("class_id undefined:", e2?.message);
})();
