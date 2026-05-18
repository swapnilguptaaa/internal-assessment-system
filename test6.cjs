const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { error } = await supabaseAdmin.from('students').insert({
        id: "2d097d2c-0a75-41a7-b6d2-3b972c2af6aa", name: 'test', email_id: 'test@t.com', enrollment_number: '1', batch_id: undefined
    });
    console.log("insert undefined batch_id:", error?.message);
})();
