import { hasSupabaseEnv } from "@/lib/env";

export const appConfig = {
  name: "Portfolio Intelligence",
  phase: "Foundation",
  supabaseConfigured: hasSupabaseEnv(),
};
