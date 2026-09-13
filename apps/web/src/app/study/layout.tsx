import type { ReactNode } from "react";

import RequireAuth from "@/components/RequireAuth";

export default function StudyLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
