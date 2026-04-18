import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env, hasSupabaseEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Some server-render paths do not allow mutating cookies.
          // Supabase can still operate for read-only requests without persisting them.
        }
      },
    },
  });
}
