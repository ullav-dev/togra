"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { updateTask } from "@/lib/awe-api";
import type { Task, TaskLink, TeamMember, TeamRole, TaskTeamRole, WorkflowWithTasks, Status } from "@/lib/types";
import StoryTaskNode, { type StoryTaskNodeData } from "@/components/workflow/StoryTaskNode";

const NODE_TYPES = { storyTaskNode: StoryTaskNode };

// StoryTaskNode renders at w-48 (192 px); height ~110 px covers most cases.
const NODE_W = 192;
const NODE_H = 110;

// ── Layout ────────────────────────────────────────────────────────────────────

function findBackEdges(tasks: Task[], links: TaskLink[]): Set<string> {
  const outEdges = new Map<string, string[]>();
  tasks.forEach((t) => outEdges.set(t.id, []));
  links.forEach((l) => outEdges.get(l.from_task_id)?.push(l.to_task_id));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const back = new Set<string>();
  function dfs(id: string) {
    visited.add(id); inStack.add(id);
    for (const next of outEdges.get(id) ?? []) {
      if (inStack.has(next)) back.add(`${id}->${next}`);
      else if (!visited.has(next)) dfs(next);
    }
    inStack.delete(id);
  }
  tasks.forEach((t) => { if (!visited.has(t.id)) dfs(t.id); });
  return back;
}

function autoLayout(tasks: Task[], links: TaskLink[]): Map<string, { x: number; y: number }> {
  if (tasks.length === 0) return new Map();
  if (tasks.length === 1) return new Map([[tasks[0].id, { x: 0, y: 0 }]]);

  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 40, marginx: 20, marginy: 20 });

  tasks.forEach((t) => g.setNode(t.id, { width: NODE_W, height: NODE_H }));

  const backEdges = findBackEdges(tasks, links);
  links
    .filter((l) => !backEdges.has(`${l.from_task_id}->${l.to_task_id}`))
    .forEach((l) => g.setEdge(l.from_task_id, l.to_task_id));

  Dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  tasks.forEach((t) => {
    const node = g.node(t.id);
    positions.set(t.id, { x: node.x - NODE_W / 2, y: node.y - NODE_H / 2 });
  });
  return positions;
}

// ── Edge builder ──────────────────────────────────────────────────────────────

function buildEdge(
  link: TaskLink,
  positions: Map<string, { x: number; y: number }>,
  tasks: Task[],
): Edge {
  const srcX = positions.get(link.from_task_id)?.x ?? 0;
  const tgtX = positions.get(link.to_task_id)?.x ?? 0;
  const isLoop = srcX > tgtX;
  const isBranch = link.branch_label != null && link.branch_label !== "";

  const srcTask = tasks.find((t) => t.id === link.from_task_id);
  const tgtTask = tasks.find((t) => t.id === link.to_task_id);
  // Green when source is complete and target has started (active forward path)
  const ACTIVE_STATUSES = new Set(["Ready", "In Progress", "On Hold", "Complete"]);
  const isActive = !isLoop &&
    srcTask?.status === "Complete" &&
    tgtTask != null && ACTIVE_STATUSES.has(tgtTask.status);

  const stroke = isActive ? "#059669" : "#94a3b8"; // emerald-600 or slate-400

  return {
    id: `${link.from_task_id}->${link.to_task_id}`,
    source: link.from_task_id,
    target: link.to_task_id,
    sourceHandle: isLoop ? "loop-source" : "forward-source",
    targetHandle: isLoop ? "loop-target" : "forward-target",
    markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    style: {
      stroke,
      strokeWidth: isActive ? 2.5 : 2,
      ...(isLoop && { strokeDasharray: "5 4" }),
    },
    type: "smoothstep",
    ...(isBranch && {
      label: link.branch_label,
      labelStyle: { fill: "#4338ca", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "#eef2ff", fillOpacity: 0.95 },
    }),
  };
}

// ── Node builder ──────────────────────────────────────────────────────────────

function buildNode(
  task: Task,
  position: { x: number; y: number },
  selectedId: string | null,
  onSelect: (id: string) => void,
  roles: TeamRole[],
  assignedMember: TeamMember | null,
): Node {
  return {
    id: task.id,
    type: "storyTaskNode",
    position,
    data: { task, selected: selectedId === task.id, onSelect, roles, assignedMember } as unknown as Record<string, unknown>,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  workflow: WorkflowWithTasks;
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  taskTeamRoles: Record<string, TaskTeamRole[]>;
  token: string;
  onTaskUpdated: (task: Task) => void;
}

const STATUSES: Status[] = ["Not Started", "Ready", "In Progress", "On Hold", "Complete"];

export default function WorkflowCanvas({
  workflow,
  teamMembers,
  teamRoles,
  taskTeamRoles,
  token,
  onTaskUpdated,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>(workflow.tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nodePositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Compute layout: Dagre baseline, then overlay any positions persisted in the DB.
  const layout = useMemo(() => {
    const l = autoLayout(tasks, workflow.links);
    tasks.forEach((t) => {
      if (t.canvas_x != null && t.canvas_y != null) {
        l.set(t.id, { x: t.canvas_x, y: t.canvas_y });
      }
    });
    l.forEach((pos, id) => nodePositions.current.set(id, pos));
    return l;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.map((t) => t.id).join(","), workflow.links]);

  function resolvedRoles(taskId: string): TeamRole[] {
    return (taskTeamRoles[taskId] ?? [])
      .map((ttr) => teamRoles.find((r) => r.id === ttr.team_role_id))
      .filter(Boolean) as TeamRole[];
  }

  function resolvedMember(taskId: string): TeamMember | null {
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.assigned_to) return null;
    return teamMembers.find((m) => m.user.id === task.assigned_to) ?? null;
  }

  const initialNodes = useMemo<Node[]>(
    () => tasks.map((t) =>
      buildNode(t, layout.get(t.id) ?? { x: 0, y: 0 }, null, setSelectedTaskId, resolvedRoles(t.id), resolvedMember(t.id))
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialEdges = useMemo<Edge[]>(
    () => workflow.links.map((l) => buildEdge(l, nodePositions.current, tasks)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync node data when tasks, selection, or roles change
  useEffect(() => {
    setNodes((prev) =>
      tasks.map((task) => {
        const existing = prev.find((n) => n.id === task.id);
        const pos = existing?.position ?? layout.get(task.id) ?? { x: 0, y: 0 };
        nodePositions.current.set(task.id, pos);
        return buildNode(task, pos, selectedTaskId, setSelectedTaskId, resolvedRoles(task.id), resolvedMember(task.id));
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, selectedTaskId, taskTeamRoles, teamRoles, teamMembers, layout]);

  // Rebuild edges when task statuses change
  useEffect(() => {
    setEdges(workflow.links.map((l) => buildEdge(l, nodePositions.current, tasks)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, workflow.links]);

  // ── Inline edit panel ────────────────────────────────────────────────────────

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedMember = selectedTask ? resolvedMember(selectedTask.id) : null;

  const activeMembers = teamMembers.filter((m) => m.status === "active");

  async function handleStatusChange(status: Status) {
    if (!selectedTask || !token) return;
    setSaving(true);
    try {
      const updated = await updateTask(token, selectedTask.id, { status });
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      onTaskUpdated(updated);
    } finally { setSaving(false); }
  }

  async function handleAssigneeChange(userId: string | null) {
    if (!selectedTask || !token) return;
    setSaving(true);
    try {
      const updated = await updateTask(token, selectedTask.id, { assigned_to: userId });
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      onTaskUpdated(updated);
    } finally { setSaving(false); }
  }

  function memberDisplayName(m: TeamMember) {
    return `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => setSelectedTaskId(null)}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={null}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#e5e7eb" />
        <Controls showInteractive={false} position="bottom-left" />

        {/* Legend — top-left so it doesn't overlap the Controls */}
        <Panel position="top-left">
          <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] text-slate-500 shadow-sm flex items-center gap-3">
            <span><span className="inline-block w-3 h-0.5 bg-emerald-500 mr-1 align-middle rounded" /></span>active path
            <span><span className="inline-block w-3 h-0.5 bg-slate-400 mr-1 align-middle rounded" /></span>pending
            <span><span className="inline-block w-3 h-0.5 bg-slate-400 mr-1 align-middle rounded" style={{ opacity: 0.4 }} /></span>loop
          </div>
        </Panel>

        {/* Task edit panel — appears when a task is selected */}
        {selectedTask && (
          <Panel position="top-right">
            <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3 w-64">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{selectedTask.name}</p>
                  {selectedTask.description && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{selectedTask.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(null)}
                  className="text-slate-400 hover:text-slate-600 shrink-0 transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Status</label>
                  <select
                    value={selectedTask.status}
                    onChange={(e) => void handleStatusChange(e.target.value as Status)}
                    disabled={saving}
                    className="w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Assignee</label>
                  <div className="flex items-center gap-2">
                    {selectedMember && (
                      <img
                        src={selectedMember.user.avatar_url ?? ""}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <select
                      value={selectedTask.assigned_to ?? ""}
                      onChange={(e) => void handleAssigneeChange(e.target.value || null)}
                      disabled={saving}
                      className="flex-1 text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {activeMembers.map((m) => (
                        <option key={m.user.id} value={m.user.id}>{memberDisplayName(m)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {resolvedRoles(selectedTask.id).length > 0 && (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Roles</label>
                    <div className="flex flex-wrap gap-1">
                      {resolvedRoles(selectedTask.id).map((r) => (
                        <span key={r.id} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">
                          {r.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
