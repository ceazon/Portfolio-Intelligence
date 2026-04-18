"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    router.refresh();
    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-sky-500/60 hover:bg-sky-500/10 hover:text-sky-200"
    >
      Log out
    </button>
  );
}
