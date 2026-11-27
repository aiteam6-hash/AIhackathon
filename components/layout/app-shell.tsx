"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Menu as MenuIcon, X } from "lucide-react";
import type { Role } from "@/types";
import { PRODUCT_NAME } from "@/lib/config";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { authService } from "@/lib/services/authService";
import { notificationsService } from "@/lib/services/notificationsService";
import { relativeDays } from "@/lib/utils/format";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toaster";
import { Skeleton } from "@/components/ui/states";
import { Footer } from "./footer";

const NAV: Record<Role, { label: string; href: string }[]> = {
  applicant: [
    { label: "Jobs", href: "/jobs" },
    { label: "My applications", href: "/applications" },
    { label: "Profile and settings", href: "/profile" },
  ],
  recruiter: [
    { label: "Dashboard", href: "/recruiter/dashboard" },
    { label: "Roles", href: "/recruiter/jobs" },
  ],
};

function NotificationsPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data } = useAsync(() => notificationsService.list(userId), [userId]);
  const unread = data?.filter((n) => !n.read).length ?? 0;

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button className="btn btn-text btn-sm relative" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell size={17} aria-hidden />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 text-[10px] leading-4 bg-accent text-bg text-center font-semibold">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[min(22rem,calc(100vw-2rem))] bg-bg border border-ink z-40" role="region" aria-label="Notifications">
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
            <p className="font-semibold text-sm">Notifications</p>
            <button className="text-xs link" onClick={async () => { await notificationsService.markAllRead(userId); }} disabled={unread === 0}>Mark all read</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data ? <div className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
              : data.length === 0 ? <p className="p-4 text-sm text-muted">Nothing yet. Status changes will show up here.</p>
              : data.map((n) => (
                <button key={n.id} className="block w-full text-left px-4 py-3 border-b border-rule hover:bg-hover"
                  onClick={async () => { await notificationsService.markRead(n.id); setOpen(false); router.push(n.href); }}>
                  <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>{!n.read && <span className="text-accent" aria-label="Unread">● </span>}{n.title}</span>
                  <span className="block text-sm text-muted">{n.body}</span>
                  <span className="block text-xs text-muted mt-1">{relativeDays(n.at)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Signed-in frame for one role: guards the route, shows the sidebar, notifications and account menu. */
export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const { ready, user, role: sessionRole, needsRole, isDemo } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const allowed = ready && !!user && sessionRole === role;

  // Only redirect visitors who arrive without access. When a signed-in user switches role or signs out,
  // the handler that did it navigates; redirecting here as well would race with that navigation.
  const wasAllowed = useRef(false);
  useEffect(() => {
    if (allowed) wasAllowed.current = true;
    else if (ready && user && sessionRole) router.replace(sessionRole === "recruiter" ? "/recruiter/dashboard" : "/jobs");
    else if (ready && !wasAllowed.current) {
      const next = encodeURIComponent(path);
      router.replace(needsRole ? `/choose-role?role=${role}&next=${next}` : `/login?role=${role}&next=${next}`);
    }
  }, [ready, allowed, user, sessionRole, needsRole, role, path, router]);

  if (!allowed) {
    return (
      <div className="min-h-screen grid place-items-center" role="status" aria-label="Checking your session">
        <div className="w-64 space-y-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
      </div>
    );
  }

  const other: Role = role === "applicant" ? "recruiter" : "applicant";
  const nav = NAV[role];
  const isActive = (href: string) => path === href || (href !== "/jobs" && path.startsWith(href + "/")) || (href === "/jobs" && (path === "/jobs" || path.startsWith("/jobs/") || path.startsWith("/apply/")));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="lg:border-r lg:border-ink lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col">
        <div className="flex items-center justify-between px-5 h-16 border-b border-ink lg:border-b-0">
          <Link href={role === "recruiter" ? "/recruiter/dashboard" : "/jobs"} className="font-display text-2xl">{PRODUCT_NAME}</Link>
          <button className="lg:hidden btn btn-text btn-sm" aria-expanded={navOpen} aria-label="Toggle navigation" onClick={() => setNavOpen((o) => !o)}>
            {navOpen ? <X size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
        <nav aria-label={`${role} navigation`} className={`${navOpen ? "block" : "hidden"} lg:block px-3 pb-4 border-b border-ink lg:border-b-0`}>
          <p className="eyebrow px-2 pt-4 pb-2">{role === "recruiter" ? "Recruiter" : "Applicant"}</p>
          <ul>
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} onClick={() => setNavOpen(false)} aria-current={isActive(n.href) ? "page" : undefined}
                  className={`block px-3 py-2 text-sm border-l-2 ${isActive(n.href) ? "border-accent font-semibold bg-hover" : "border-transparent hover:bg-hover"}`}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0 flex flex-col">
        <div className="h-16 border-b border-rule flex items-center justify-end gap-2 px-5 md:px-10">
          <NotificationsPanel userId={user!.id} />
          <Menu
            label="Account menu" triggerClassName="btn btn-quiet btn-sm"
            trigger={<>{user!.name}<ChevronDown size={14} aria-hidden /></>}
            items={[
              { label: `Signed in as ${user!.email}`, disabled: true },
              ...(isDemo ? [{ label: `Switch to demo ${other}`, separated: true, onClick: async () => { await authService.loginDemo(other); toast.success(`Now viewing the demo ${other} account.`); router.push(other === "recruiter" ? "/recruiter/dashboard" : "/jobs"); } }] : []),
              ...(role === "applicant" ? [{ label: "Profile and settings", href: "/profile" }] : []),
              { label: "Sign out", onClick: async () => { await authService.logout(); router.push("/"); } },
            ]}
          />
        </div>
        <main id="main" className="flex-1 px-5 md:px-10 py-8 max-w-[1180px] w-full">{children}</main>
        <div className="px-5 md:px-10"><Footer compact /></div>
      </div>
    </div>
  );
}
