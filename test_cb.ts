import { createClient } from "@supabase/supabase-js";
try {
  createClient("", "");
  console.log("Success with empty string!");
} catch (e: any) {
  console.log("Error empty string:", e.message);
}
