import type { Notification } from "@/types";
import { mutate } from "@/lib/store/store";
import { state } from "./util";

export const notificationsService = {
  async list(userId: string): Promise<Notification[]> {
    return state().notifications.filter((n) => n.userId === userId).sort((a, b) => b.at.localeCompare(a.at));
  },
  async markRead(id: string) {
    mutate((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
  },
  async markAllRead(userId: string) {
    mutate((s) => ({ notifications: s.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)) }));
  },
};
