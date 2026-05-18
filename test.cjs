const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    try {
        const { error } = await supabase.from('class_enrollments').select('*').eq('class_id', "undefined");
        console.log(error);
    } catch(e) {
        console.log("caught", e);
    }
})();
