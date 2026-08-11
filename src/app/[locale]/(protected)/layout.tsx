"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { NoteEventsProvider } from "@ullav-dev/tack-notes";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  // Wraps every protected page, not just the ones that render NotesPanel --
  // tack-notes' event bus needs exactly one shared provider per page tree,
  // and this is the one ancestor every NotesPanel usage already sits under.
  return <NoteEventsProvider>{children}</NoteEventsProvider>;
}
