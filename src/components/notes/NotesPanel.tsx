"use client";

// Thin togra-specific wrapper around @ullav-dev/tack-notes's TackNotesPanel
// -- the entity-attached notes widget every AWE-based app's own NotesPanel
// actually needs. This *replaces* togra's former awe-server-backed
// NotesPanel (git history has the old implementation; notes-api.ts's old
// listNotes/createNote/etc. were deleted once nothing called them any
// more) as part of the AWE-apps -> tack-notes migration; tack's own
// NoteThread/NoteTree UI is the reference, not a per-app rebuild.
//
// folderScope="team": togra's folders were never entity-scoped -- awe-
// server's note_folders had no team/entity concept at all (WHERE created_by
// = $1, full stop), so a folder created while looking at one story's notes
// was already usable from any other entity too. The Phase 2 backfill
// resolved that into tack-server's team-scoped note_folders (a folder's own
// entity if it had one, else inferred from its filed notes' shared team),
// so this panel reads/writes that same team-wide set -- see
// TackNotesPanel's own folderScope doc comment for what that does and
// doesn't allow (folder delete is intentionally unavailable in this mode).
//
// resolveAuthor: unlike cunav (no member list, batched roster lookups),
// every call site here already has the team's member list on hand -- a
// closure over it is all that's needed.

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin as isAdminToken } from "@/lib/auth-api";
import { createTackNotesApi, TackNotesPanel, type Note as TackNote } from "@ullav-dev/tack-notes";
import type { NoteEntityType } from "@/lib/types";

/** Same entity identity the Phase 2 backfill script attached historical
 * notes under -- see tack-server's backfill-awe-notes binary. Must never
 * drift from that value, or historical notes stop showing up here. */
const OWNING_SERVICE = "awe";

interface NoteAuthor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string;
}

interface NotesPanelProps {
  entityType: NoteEntityType;
  entityId: string;
  /** The entity's own team -- required for every write (tack-server's
   *  create_note/create_note_folder both need an explicit team_id; awe-
   *  server's old notes derived it implicitly from the entity, which
   *  tack-server deliberately doesn't do). Each call site already resolves
   *  this (job.team_id ?? project.team_id, etc.) for other purposes. */
  teamId: string | null;
  /** Known team members, for resolving author UUIDs to display names. */
  members?: NoteAuthor[];
  autoSelectFirst?: boolean;
  compact?: boolean;
  twoColumn?: boolean;
}

export default function NotesPanel({ entityType, entityId, teamId, members = [], autoSelectFirst = false, compact = false, twoColumn = false }: NotesPanelProps) {
  const { user, token } = useAuth();
  const t = useTranslations("notes");

  const api = useMemo(() => (token ? createTackNotesApi("/api/tack", token) : null), [token]);

  function resolveAuthor(userId: string, _teamId: string | null, _note?: TackNote): string {
    if (userId === user?.id) return user.username ?? t("you");
    const member = members.find((m) => m.id === userId);
    if (member) return `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || member.username;
    return `${userId.slice(0, 8)}…`;
  }

  if (!token || !api || !teamId) {
    return <div className="text-sm text-slate-400 py-6 text-center">{t("loading")}</div>;
  }

  return (
    <TackNotesPanel
      api={api}
      owningService={OWNING_SERVICE}
      entityType={entityType}
      entityId={entityId}
      teamId={teamId}
      currentUserId={user?.id ?? ""}
      isAdmin={isAdminToken(token)}
      resolveAuthor={resolveAuthor}
      t={t}
      editable
      showFolders={!compact}
      folderScope="team"
      compact={compact}
      twoColumn={twoColumn}
      autoSelectFirst={autoSelectFirst}
      defaultVisibility="team"
      showUnreadBadges
    />
  );
}
