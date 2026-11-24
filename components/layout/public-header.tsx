"use client";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/config";
import { useSession } from "@/lib/hooks/useSession";

export function PublicHeader() {
  const { ready, user, role } = useSession();
  const home = role === "recruiter" ? "/recruiter/dashboard" : "/jobs";
  return (
    <header className="border-b border-ink">
      <div className="container-x flex items-center justify-between gap-4 h-16">
        <Link href="/" className="font-display text-2xl tracking-tight">{PRODUCT_NAME}</Link>
        <nav aria-label="Main" className="hidden md:flex items-center gap-7 text-sm">
          <Link href="/#how-it-works" className="hover:text-accent hover:underline">How it works</Link>
          <Link href="/#example" className="hover:text-accent hover:underline">Example</Link>
          <Link href="/jobs" className="hover:text-accent hover:underline">Browse jobs</Link>
          <Link href="/about" className="hover:text-accent hover:underline">About</Link>
        </nav>
        <div className="flex items-center gap-2">
          {ready && user ? (
            <Link href={home} className="btn btn-primary btn-sm">Open {role === "recruiter" ? "dashboard" : "my jobs"}</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-text btn-sm">Sign in</Link>
              <Link href="/signup" className="btn btn-primary btn-sm">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
