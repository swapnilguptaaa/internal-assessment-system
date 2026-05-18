import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

async function testSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  console.log("URL exists:", !!url);
  console.log("Key exists:", !!key);
  try {
    const response = await fetch(url + "/rest/v1/", {
      headers: {
        "apikey": key || "",
        "Authorization": "Bearer " + key
      }
    });
    console.log("Status:", response.status);
    console.log("Status Text:", response.statusText);
  } catch (e: any) {
    console.error("Fetch Error:", e.message);
  }
}

testSupabase();
