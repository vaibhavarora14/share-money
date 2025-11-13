-- Ensure pg_net extension exists
-- This extension is used by Supabase for HTTP requests from PostgreSQL
-- It's typically enabled by default in Supabase projects

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
