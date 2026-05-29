"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listWorkflows, listTasks } from "@/lib/awe-api";
import type { Job, Task, TeamMember } from "@/lib/types";
import StatusPill from "@/components/StatusPill";

interface MemberTask {
  task: Task;
  storyId: string;
  storyName: string;
  sprintId: string;
  sprintName: string;
}

interface Props {
  sprints: Job[];
  teamMembers: TeamMember[];
  token: string;
  projectId: string;
}

function MemberAvatar({ member, size = "lg" }: { member: TeamMember; size?: "lg" | "sm" }) {
  const [broken, setBroken] = useState(false);
  const initials = (
    `${member.user.first_name?.charAt(0) ?? ""}${member.user.last_name?.charAt(0) ?? ""}`
  ).toUpperCase() || member.user.username.charAt(0).toUpperCase();
  const label = `${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username;
  const dim = size === "lg"
    ? "w-12 h-12 text-lg"
    : "w-7 h-7 text-xs";

  if (member.user.avatar_url && !broken) {
    return (
      <img
        src={member.user.avatar_url}
        alt={label}
        className={`${dim} rounded-full object-cover shrink-0`}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`${dim} rounded-full bg-violet-100 text-violet-700 font-semibold flex items-center justify-center select-none shrink-0`}>
      {initials}
    </span>
  );
}

function roleBadge(role: TeamMember["role"], t: (k: string) => string) {
  const map: Record<TeamMember["role"], string> = {
    owner: "bg-violet-100 text-violet-700",
    leader: "bg-blue-100 text-blue-700",
    member: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[role]}`}>
      {t(`role.${role}`)}
    </span>
  );
}

export default function TeamView({ sprints, teamMembers, token, projectId }: Props) {
  const t = useTranslations("teamView");
  const [taskMap, setTaskMap] = useState<Record<string, MemberTask[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || sprints.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      // Load all sprint stories in parallel
      const sprintStories = await Promise.all(
        sprints.map(async (sprint) => {
          const stories = await listWorkflows(token, { job_id: sprint.id }).catch(() => []);
          return { sprint, stories };
        })
      );

      // Load tasks for all stories in parallel
      const allTasks: MemberTask[] = [];
      await Promise.all(
        sprintStories.flatMap(({ sprint, stories }) =>
          stories.map(async (story) => {
            const tasks = await listTasks(token, story.id).catch(() => []);
            for (const task of tasks) {
              allTasks.push({
                task,
                storyId: story.id,
                storyName: story.name,
                sprintId: sprint.id,
                sprintName: sprint.name,
              });
            }
          })
        )
      );

      if (cancelled) return;

      // Build per-member map (assigned tasks only)
      const map: Record<string, MemberTask[]> = {};
      for (const mt of allTasks) {
        if (!mt.task.assigned_to) continue;
        if (!map[mt.task.assigned_to]) map[mt.task.assigned_to] = [];
        map[mt.task.assigned_to].push(mt);
      }
      setTaskMap(map);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [token, sprints]);

  if (teamMembers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        {t("noTeam")}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {loading && (
        <p className="text-sm text-slate-400 mb-4">{t("loading")}</p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {teamMembers.map((member) => {
          const tasks = taskMap[member.user.id] ?? [];
          const displayName = `${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username;
          const customRoles = member.team_roles.map((r) => r.name);

          return (
            <div key={member.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Member header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <MemberAvatar member={member} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 leading-tight">{displayName}</span>
                    {roleBadge(member.role, t)}
                  </div>
                  {customRoles.length > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{customRoles.join(" · ")}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">{member.user.username}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                  tasks.length > 0
                    ? "bg-violet-50 text-violet-700"
                    : "bg-slate-100 text-slate-400"
                }`}>
                  {loading ? "…" : t("taskCount", { count: tasks.length })}
                </span>
              </div>

              {/* Task list */}
              {!loading && tasks.length === 0 ? (
                <p className="px-5 py-3 text-xs text-slate-400 italic">{t("noTasks")}</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {tasks.map((mt) => (
                    <div key={mt.task.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 group">
                      <StatusPill status={mt.task.status} />
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/projects/${projectId}/stories/${mt.storyId}`}
                          className="text-sm text-slate-700 hover:text-violet-700 transition-colors leading-snug line-clamp-1"
                        >
                          {mt.task.name}
                        </Link>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {mt.storyName}
                          <span className="mx-1">·</span>
                          {mt.sprintName}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
