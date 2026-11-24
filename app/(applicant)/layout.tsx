import { AppShell } from "@/components/layout/app-shell";

export default function ApplicantLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="applicant">{children}</AppShell>;
}
