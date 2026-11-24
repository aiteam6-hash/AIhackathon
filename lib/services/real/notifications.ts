import type { Notification } from "@/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { bump, ServiceError } from "../util";

const sb = () => supabaseBrowser();

interface Row { id: string; user_id: string; title: string; body: string; href: string; created_at: string; read_at: string | null }

export const realNotifications = {
  async list(userId: string): Promise<Notification[]> {
    const { data, error } = await sb().from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new ServiceError(error.message);
    return ((data ?? []) as Row[]).map((n) => ({
      id: n.id, userId: n.user_id, title: n.title, body: n.body, href: n.href, at: n.created_at, read: !!n.read_at,
    }));
  },
  async markRead(id: string) {
    await sb().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    bump();
  },
  async markAllRead(userId: string) {
    await sb().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    bump();
  },
};
