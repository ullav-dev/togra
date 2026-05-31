"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/auth-api";
import {
  adminListUsers,
  adminListTeams,
  adminGetTeam,
  adminListTeamProducts,
  adminEnableTeamProduct,
  adminAddTeamMember,
  adminRemoveTeamMember,
  adminAssignProductRole,
  type AdminUser,
  type AdminTeam,
  type AdminTeamSummary,
} from "@/lib/auth-api";
import ConfirmDialog from "@/components/ConfirmDialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TograTeam {
  summary: AdminTeamSummary;
  detail: AdminTeam;
  productSlug: "togra" | "obair";
}

interface UserAccessRow {
  user: AdminUser;
  /** Teams (with Togra access) this user belongs to. */
  memberships: Array<{ team: TograTeam; role: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(u: { first_name: string | null; last_name: string | null; username: string }) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;
}

function userInitials(u: AdminUser) {
  return (
    `${u.first_name?.charAt(0) ?? ""}${u.last_name?.charAt(0) ?? ""}`.toUpperCase() ||
    u.username.charAt(0).toUpperCase()
  );
}

// ── Grant Modal ───────────────────────────────────────────────────────────────

function GrantModal({
  user,
  tograTeams,
  onGrant,
  onCancel,
  busy,
}: {
  user: AdminUser;
  tograTeams: TograTeam[];
  onGrant: (teamId: string, role: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [teamId, setTeamId] = useState(tograTeams[0]?.summary.id ?? "");
  const [role, setRole] = useState<"member" | "lead" | "admin">("member");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6">
        <h3 className="font-semibold text-slate-800 text-base mb-1">Grant Togra access</h3>
        <p className="text-sm text-slate-500 mb-5">
          Add <span className="font-medium text-slate-700">{displayName(user)}</span> to a Togra-enabled team.
        </p>

        <div className="space-y-4">
          {tograTeams.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
              >
                {tograTeams.map((t) => (
                  <option key={t.summary.id} value={t.summary.id}>{t.summary.name}</option>
                ))}
              </select>
            </div>
          )}
          {tograTeams.length === 1 && (
            <p className="text-sm text-slate-600">
              Team: <span className="font-medium">{tograTeams[0].summary.name}</span>
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
            >
              <option value="member">Member</option>
              <option value="lead">Lead</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onGrant(teamId, role)}
            disabled={busy || !teamId}
            className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {busy ? "Granting…" : "Grant access"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Enable Product Modal ──────────────────────────────────────────────────────

function EnableProductModal({
  teams,
  onEnable,
  onCancel,
  busy,
}: {
  teams: AdminTeamSummary[];
  onEnable: (teamId: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6">
        <h3 className="font-semibold text-slate-800 text-base mb-1">Enable Togra for a team</h3>
        <p className="text-sm text-slate-500 mb-5">
          Select a team to grant Togra product access. All active members of that team will then be grantable.
        </p>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Team</label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={() => onEnable(teamId)} disabled={busy || !teamId}
            className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40">
            {busy ? "Enabling…" : "Enable Togra"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccessAdminPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<UserAccessRow[]>([]);
  const [tograTeams, setTograTeams] = useState<TograTeam[]>([]);
  const [allTeams, setAllTeams] = useState<AdminTeamSummary[]>([]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");

  const [grantTarget, setGrantTarget] = useState<AdminUser | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<UserAccessRow | null>(null);
  const [enableTeamModal, setEnableTeamModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (token && !isAdmin(token)) router.replace("/projects");
  }, [token, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [usersPage, teamsPage] = await Promise.all([
        adminListUsers(token),
        adminListTeams(token),
      ]);

      // Find teams with togra or obair product access
      const productChecks = await Promise.all(
        teamsPage.teams.map(async (t) => {
          const products = await adminListTeamProducts(token, t.id);
          const tograSlug = products.find((p) => p.product_slug === "togra")
            ? "togra"
            : products.find((p) => p.product_slug === "obair")
            ? "obair"
            : null;
          return { summary: t, tograSlug };
        }),
      );

      const togTeams: TograTeam[] = [];
      for (const { summary, tograSlug } of productChecks) {
        if (!tograSlug) continue;
        const detail = await adminGetTeam(token, summary.id);
        togTeams.push({ summary, detail, productSlug: tograSlug as "togra" | "obair" });
      }

      setTograTeams(togTeams);
      setAllTeams(teamsPage.teams);

      // Build per-user access rows
      const userRows: UserAccessRow[] = usersPage.users.map((user) => {
        const memberships = togTeams.flatMap((team) => {
          const member = team.detail.members.find((m) => m.user.id === user.id && m.status === "active");
          if (!member) return [];
          return [{ team, role: member.role }];
        });
        return { user, memberships };
      });

      setRows(userRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleGrant(userId: string, teamId: string, role: string) {
    if (!token) return;
    setBusy(true);
    try {
      const team = tograTeams.find((t) => t.summary.id === teamId)!;
      await adminAddTeamMember(token, teamId, userId);
      await adminAssignProductRole(token, teamId, userId, team.productSlug, role);
      await load();
      setGrantTarget(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to grant access");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(row: UserAccessRow) {
    if (!token) return;
    setBusy(true);
    try {
      for (const { team } of row.memberships) {
        await adminRemoveTeamMember(token, team.summary.id, row.user.id);
      }
      await load();
      setRevokeTarget(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to revoke access");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnableProduct(teamId: string) {
    if (!token) return;
    setBusy(true);
    try {
      await adminEnableTeamProduct(token, teamId, "togra");
      await load();
      setEnableTeamModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to enable Togra for team");
    } finally {
      setBusy(false);
    }
  }

  const filtered = rows.filter((r) => {
    const hasAccess = r.memberships.length > 0;
    if (filter === "with" && !hasAccess) return false;
    if (filter === "without" && hasAccess) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.user.username.toLowerCase().includes(q) ||
        r.user.email.toLowerCase().includes(q) ||
        displayName(r.user).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const withAccess = rows.filter((r) => r.memberships.length > 0).length;
  const withoutAccess = rows.filter((r) => r.memberships.length === 0).length;

  if (!token || !isAdmin(token)) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Togra Access</h1>
            {!loading && (
              <p className="text-xs text-slate-400 mt-0.5">
                {withAccess} user{withAccess !== 1 ? "s" : ""} with access · {withoutAccess} without
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {tograTeams.length === 0 && !loading && (
              <button
                onClick={() => setEnableTeamModal(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/>
                </svg>
                Enable Togra for a team
              </button>
            )}
          </div>
        </div>

        {/* Togra teams summary */}
        {tograTeams.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tograTeams.map((t) => (
              <span key={t.summary.id} className="inline-flex items-center gap-1.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
                  <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
                </svg>
                {t.summary.name}
                <span className="text-violet-400">·</span>
                <span className="text-violet-500">{t.productSlug}</span>
              </span>
            ))}
            <button
              onClick={() => setEnableTeamModal(true)}
              className="text-xs text-slate-400 hover:text-violet-700 transition-colors"
            >
              + Enable another team
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex items-center gap-4">
        <input
          type="search"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 w-60 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
        <div className="flex gap-1 text-xs font-medium">
          {(["all", "with", "without"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${filter === f ? "bg-violet-50 text-violet-700" : "text-slate-500 hover:bg-slate-100"}`}>
              {f === "all" ? "All" : f === "with" ? "Has access" : "No access"}
            </button>
          ))}
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="text-xs text-violet-700 hover:underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No users found.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Access</th>
                <th className="w-32 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => {
                const hasAccess = row.memberships.length > 0;
                return (
                  <tr key={row.user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        {row.user.avatar_url ? (
                          <img src={row.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                            {userInitials(row.user)}
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-slate-800">{displayName(row.user)}</p>
                          <p className="text-xs text-slate-400">@{row.user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm">{row.user.email}</td>
                    <td className="px-4 py-3">
                      {hasAccess ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.memberships.map(({ team, role }) => (
                            <span key={team.summary.id} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                              {team.summary.name}
                              <span className="text-green-400">·</span>
                              {role}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No access</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {hasAccess ? (
                        <button
                          onClick={() => setRevokeTarget(row)}
                          disabled={busy}
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40 transition-colors"
                        >
                          Revoke
                        </button>
                      ) : tograTeams.length > 0 ? (
                        <button
                          onClick={() => setGrantTarget(row.user)}
                          disabled={busy}
                          className="text-xs font-medium text-violet-700 hover:text-violet-900 disabled:opacity-40 transition-colors"
                        >
                          Grant access
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Grant modal */}
      {grantTarget && (
        <GrantModal
          user={grantTarget}
          tograTeams={tograTeams}
          busy={busy}
          onGrant={(teamId, role) => void handleGrant(grantTarget.id, teamId, role)}
          onCancel={() => setGrantTarget(null)}
        />
      )}

      {/* Revoke confirm */}
      {revokeTarget && (
        <ConfirmDialog
          title="Revoke Togra access?"
          message={`${displayName(revokeTarget.user)} will be removed from all Togra teams and will no longer be able to log in.`}
          confirmLabel="Revoke"
          variant="danger"
          onConfirm={() => void handleRevoke(revokeTarget)}
          onCancel={() => setRevokeTarget(null)}
        />
      )}

      {/* Enable team product modal */}
      {enableTeamModal && (
        <EnableProductModal
          teams={allTeams.filter((t) => !tograTeams.find((tt) => tt.summary.id === t.id))}
          busy={busy}
          onEnable={(teamId) => void handleEnableProduct(teamId)}
          onCancel={() => setEnableTeamModal(false)}
        />
      )}
    </div>
  );
}
