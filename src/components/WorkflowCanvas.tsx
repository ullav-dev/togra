"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { updateTask, deleteTask, createTask, createTaskLink, deleteTaskLink, instantiateWorkItem } from "@/lib/awe-api";
import type { Task, TaskLink, TeamMember, TeamRole, TaskTeamRole, WorkflowWithTasks, Status, InstantiateWorkItemResponse } from "@/lib/types";
import StoryTaskNode, { type StoryTaskNodeData } from "@/components/workflow/StoryTaskNode";
import AddStepModal from "@/components/workflow/AddStepModal";
import BranchLabelModal from "@/components/workflow/BranchLabelModal";
import ImportTemplateModal from "@/components/workflow/ImportTemplateModal";
import WorkItemPickerModal from "@/components/workflow/WorkItemPickerModal";
import StepEditDrawer from "@/components/workflow/StepEditDrawer";

const NODE_TYPES = { storyTaskNode: StoryTaskNode };

const NODE_W = 192;
const NODE_H = 110;

// ── Layout (same Dagre approach as before) ────────────────────────────────────

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

function buildEdge(link: TaskLink, positions: Map<string, { x: number; y: number }>, tasks: Task[]): Edge {
  const srcX = positions.get(link.from_task_id)?.x ?? 0;
  const tgtX = positions.get(link.to_task_id)?.x ?? 0;
  const isLoop = srcX > tgtX;
  const isBranch = link.branch_label != null && link.branch_label !== "";

  const srcTask = tasks.find((t) => t.id === link.from_task_id);
  const tgtTask = tasks.find((t) => t.id === link.to_task_id);
  const ACTIVE = new Set(["Ready", "In Progress", "On Hold", "Complete"]);
  const isActive = !isLoop && srcTask?.status === "Complete" && tgtTask != null && ACTIVE.has(tgtTask.status);
  const stroke = isActive ? "#059669" : "#94a3b8";

  return {
    id: `${link.from_task_id}->${link.to_task_id}`,
    source: link.from_task_id,
    target: link.to_task_id,
    sourceHandle: isLoop ? "loop-source" : "forward-source",
    targetHandle: isLoop ? "loop-target" : "forward-target",
    markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    style: { stroke, strokeWidth: isActive ? 2.5 : 2, ...(isLoop && { strokeDasharray: "5 4" }) },
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
  isEditMode: boolean,
  onSelect: (id: string) => void,
  roles: TeamRole[],
  assignedMember: TeamMember | null,
): Node {
  return {
    id: task.id,
    type: "storyTaskNode",
    position,
    data: { task, selected: selectedId === task.id, isEditMode, onSelect, roles, assignedMember } as unknown as Record<string, unknown>,
  };
}

// ── Pending connection (for branch label prompt) ──────────────────────────────

interface PendingConnection {
  connection: Connection;
  fromTask: Task;
  toTask: Task;
}

// ── Inner canvas (needs ReactFlowProvider context) ────────────────────────────

interface InnerProps {
  workflow: WorkflowWithTasks;
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  taskTeamRoles: Record<string, TaskTeamRole[]>;
  token: string;
  onTaskUpdated: (task: Task) => void;
}

function WorkflowCanvasInner({
  workflow, teamMembers, teamRoles, taskTeamRoles, token, onTaskUpdated,
}: InnerProps) {
  const { screenToFlowPosition } = useReactFlow();

  const [tasks, setTasks] = useState<Task[]>(workflow.tasks);
  const [links, setLinks] = useState<TaskLink[]>(workflow.links);
  const [localTaskTeamRoles, setLocalTaskTeamRoles] = useState<Record<string, TaskTeamRole[]>>(taskTeamRoles);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(workflow.tasks.length === 0);
  const [saving, setSaving] = useState(false);

  // Modals
  const [showAddStep, setShowAddStep] = useState(false);
  const [showImportTemplate, setShowImportTemplate] = useState(false);
  const [showWorkItemPicker, setShowWorkItemPicker] = useState(false);
  const [lastTaskType, setLastTaskType] = useState<"standard" | "decision" | "automated">("standard");
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);

  const nodePositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const reconnectSuccessful = useRef(false);

  const layout = useMemo(() => {
    const l = autoLayout(tasks, links);
    tasks.forEach((t) => {
      if (t.canvas_x != null && t.canvas_y != null) l.set(t.id, { x: t.canvas_x, y: t.canvas_y });
    });
    l.forEach((pos, id) => nodePositions.current.set(id, pos));
    return l;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.map((t) => t.id).join(","), links]);

  function resolvedRoles(taskId: string): TeamRole[] {
    return (localTaskTeamRoles[taskId] ?? [])
      .map((ttr) => teamRoles.find((r) => r.id === ttr.team_role_id))
      .filter(Boolean) as TeamRole[];
  }

  function resolvedMember(taskId: string): TeamMember | null {
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.assigned_to) return null;
    return teamMembers.find((m) => m.user.id === task.assigned_to) ?? null;
  }

  const buildNodes = useCallback((prevNodes: Node[]) =>
    tasks.map((task) => {
      const existing = prevNodes.find((n) => n.id === task.id);
      const pos = existing?.position ?? layout.get(task.id) ?? { x: 0, y: 0 };
      nodePositions.current.set(task.id, pos);
      return buildNode(task, pos, selectedTaskId, isEditMode, setSelectedTaskId, resolvedRoles(task.id), resolvedMember(task.id));
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tasks, selectedTaskId, isEditMode, localTaskTeamRoles, teamRoles, teamMembers, layout]);

  const initialNodes = useMemo<Node[]>(
    () => tasks.map((t) => buildNode(t, layout.get(t.id) ?? { x: 0, y: 0 }, null, false, setSelectedTaskId, resolvedRoles(t.id), resolvedMember(t.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges = useMemo<Edge[]>(
    () => links.map((l) => buildEdge(l, nodePositions.current, tasks)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => { setNodes((prev) => buildNodes(prev)); }, [buildNodes, setNodes]);
  useEffect(() => {
    setEdges(links.map((l) => buildEdge(l, nodePositions.current, tasks)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, links]);

  // ── Drag to persist position ────────────────────────────────────────────────

  function handleNodeDragStop(_: React.MouseEvent, node: Node) {
    const pos = node.position;
    nodePositions.current.set(node.id, pos);
    void updateTask(token, node.id, { canvas_x: pos.x, canvas_y: pos.y });
  }

  // ── Connect (draw edge) ─────────────────────────────────────────────────────

  function handleConnect(connection: Connection) {
    const fromTask = tasks.find((t) => t.id === connection.source);
    const toTask = tasks.find((t) => t.id === connection.target);
    if (!fromTask || !toTask || connection.source === connection.target) return;

    // Decision nodes require a branch label
    if (fromTask.task_type === "decision") {
      setPendingConnection({ connection, fromTask, toTask });
    } else {
      void confirmConnect(connection, null);
    }
  }

  async function confirmConnect(connection: Connection, branchLabel: string | null) {
    const link = await createTaskLink(token, {
      from_task_id: connection.source!,
      to_task_id: connection.target!,
      branch_label: branchLabel || null,
    });
    setLinks((prev) => [...prev.filter((l) => !(l.from_task_id === link.from_task_id && l.to_task_id === link.to_task_id)), link]);
    setEdges((prev) => addEdge({
      ...connection,
      id: `${connection.source}->${connection.target}`,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      style: { stroke: "#94a3b8", strokeWidth: 2 },
      ...(branchLabel ? {
        label: branchLabel,
        labelStyle: { fill: "#4338ca", fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "#eef2ff", fillOpacity: 0.95 },
      } : {}),
    }, prev));
    setPendingConnection(null);
  }

  // ── Remove link ─────────────────────────────────────────────────────────────

  function handleLinkRemoved(fromId: string, toId: string) {
    void deleteTaskLink(token, fromId, toId).catch(() => {});
    setLinks((prev) => prev.filter((l) => !(l.from_task_id === fromId && l.to_task_id === toId)));
    setEdges((prev) => prev.filter((e) => e.id !== `${fromId}->${toId}`));
  }

  // ── Delete edges (keyboard shortcut or programmatic) ────────────────────────

  function handleEdgesDelete(deletedEdges: Edge[]) {
    for (const edge of deletedEdges) {
      const parts = edge.id.split("->");
      if (parts.length === 2) handleLinkRemoved(parts[0], parts[1]);
    }
  }

  // ── Reconnect (drag edge endpoint to new target) ─────────────────────────────

  function handleReconnectStart() {
    reconnectSuccessful.current = false;
  }

  async function handleReconnect(oldEdge: Edge, newConnection: Connection) {
    reconnectSuccessful.current = true;
    const parts = oldEdge.id.split("->");
    if (parts.length !== 2 || !newConnection.source || !newConnection.target) return;
    const [oldFrom, oldTo] = parts;
    const fromTask = tasks.find((t) => t.id === newConnection.source);
    const toTask = tasks.find((t) => t.id === newConnection.target);
    if (!fromTask || !toTask || newConnection.source === newConnection.target) return;

    // Optimistic visual update
    setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));

    // Remove old link
    void deleteTaskLink(token, oldFrom, oldTo).catch(() => {});
    setLinks((prev) => prev.filter((l) => !(l.from_task_id === oldFrom && l.to_task_id === oldTo)));

    // Create new link — prompt for branch label if source is a decision node
    if (fromTask.task_type === "decision") {
      setPendingConnection({ connection: newConnection, fromTask, toTask });
    } else {
      const newLink = await createTaskLink(token, {
        from_task_id: newConnection.source,
        to_task_id: newConnection.target,
        branch_label: null,
      });
      setLinks((prev) => [...prev, newLink]);
    }
  }

  function handleReconnectEnd(_: MouseEvent | TouchEvent, edge: Edge) {
    // If the user dropped the edge on empty canvas (no target), delete the connection
    if (!reconnectSuccessful.current) {
      const parts = edge.id.split("->");
      if (parts.length === 2) handleLinkRemoved(parts[0], parts[1]);
    }
  }

  // ── Branch label edit ───────────────────────────────────────────────────────

  function handleBranchLabelChanged(fromId: string, toId: string, label: string | null) {
    void createTaskLink(token, { from_task_id: fromId, to_task_id: toId, branch_label: label }).catch(() => {});
    setLinks((prev) => prev.map((l) => l.from_task_id === fromId && l.to_task_id === toId ? { ...l, branch_label: label } : l));
  }

  // ── Add step ────────────────────────────────────────────────────────────────

  async function handleAddStep(name: string, taskType: "standard" | "decision" | "automated") {
    setLastTaskType(taskType);
    // Place near centre of viewport
    const centre = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const newTask = await createTask(token, { name, workflow_id: workflow.id, task_type: taskType });
    // Save position
    await updateTask(token, newTask.id, { canvas_x: centre.x, canvas_y: centre.y });
    const positioned = { ...newTask, canvas_x: centre.x, canvas_y: centre.y };
    nodePositions.current.set(newTask.id, centre);
    setTasks((prev) => [...prev, positioned]);
    setLocalTaskTeamRoles((prev) => ({ ...prev, [newTask.id]: [] }));
    setSelectedTaskId(newTask.id);
  }

  // ── Work item instantiation ─────────────────────────────────────────────────

  function handleWorkItemInstantiated(result: InstantiateWorkItemResponse) {
    const { primary_task, branch_tasks } = result;
    const allNewTasks = [primary_task, ...branch_tasks.map((b) => b.task)];
    setTasks((prev) => [...prev, ...allNewTasks]);
    allNewTasks.forEach((t) => {
      if (t.canvas_x != null && t.canvas_y != null) nodePositions.current.set(t.id, { x: t.canvas_x, y: t.canvas_y });
    });
    setLocalTaskTeamRoles((prev) => {
      const next = { ...prev };
      allNewTasks.forEach((t) => { next[t.id] = []; });
      return next;
    });
    if (branch_tasks.length > 0) {
      const newLinks: TaskLink[] = branch_tasks.map((b) => ({
        from_task_id: primary_task.id,
        to_task_id: b.task.id,
        branch_label: b.label,
      }));
      setLinks((prev) => [...prev, ...newLinks]);
    }
    setSelectedTaskId(primary_task.id);
  }

  // ── Import template ─────────────────────────────────────────────────────────

  async function handleImportTemplate(template: WorkflowWithTasks) {
    if (template.tasks.length === 0) return;

    // Auto-layout the template's tasks to get a tidy arrangement, then offset
    // everything to top-left (small margin so it doesn't overlap the toolbar).
    const importLayout = autoLayout(template.tasks, template.links);
    const OFFSET_X = 40;
    const OFFSET_Y = 40;

    // Create tasks sequentially so we can build the old→new ID map.
    const idMap = new Map<string, string>();
    const createdTasks: Task[] = [];

    for (const t of template.tasks) {
      const rawPos = importLayout.get(t.id) ?? { x: 0, y: 0 };
      const pos = { x: rawPos.x + OFFSET_X, y: rawPos.y + OFFSET_Y };

      const newTask = await createTask(token, {
        name: t.name,
        workflow_id: workflow.id,
        task_type: t.task_type,
        description: t.description ?? undefined,
        // is_start / is_end are intentionally not cloned — imported steps are
        // unconnected fragments; the user wires start/end into the existing flow.
      });
      // Persist canvas position
      await updateTask(token, newTask.id, { canvas_x: pos.x, canvas_y: pos.y });

      idMap.set(t.id, newTask.id);
      nodePositions.current.set(newTask.id, pos);
      createdTasks.push({ ...newTask, canvas_x: pos.x, canvas_y: pos.y });
    }

    // Create links using the remapped IDs.
    const createdLinks: TaskLink[] = [];
    for (const link of template.links) {
      const fromId = idMap.get(link.from_task_id);
      const toId = idMap.get(link.to_task_id);
      if (!fromId || !toId) continue;
      const newLink = await createTaskLink(token, {
        from_task_id: fromId,
        to_task_id: toId,
        branch_label: link.branch_label,
      });
      createdLinks.push(newLink);
    }

    setTasks((prev) => [...prev, ...createdTasks]);
    setLinks((prev) => [...prev, ...createdLinks]);
    setLocalTaskTeamRoles((prev) => {
      const next = { ...prev };
      createdTasks.forEach((t) => { next[t.id] = []; });
      return next;
    });
  }

  // ── Delete step ─────────────────────────────────────────────────────────────

  function handleTaskDeleted(taskId: string) {
    // Links cascade in DB; clean up local state
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setLinks((prev) => prev.filter((l) => l.from_task_id !== taskId && l.to_task_id !== taskId));
    setSelectedTaskId(null);
  }

  // ── Auto-arrange ────────────────────────────────────────────────────────────

  async function handleAutoArrange() {
    const newLayout = autoLayout(tasks, links);
    newLayout.forEach((pos, id) => nodePositions.current.set(id, pos));
    setNodes((prev) => prev.map((n) => {
      const pos = newLayout.get(n.id);
      return pos ? { ...n, position: pos } : n;
    }));
    // Persist positions
    await Promise.all(
      [...newLayout.entries()].map(([id, pos]) =>
        updateTask(token, id, { canvas_x: pos.x, canvas_y: pos.y }).catch(() => {})
      )
    );
  }

  // ── Task updated from drawer ────────────────────────────────────────────────

  function handleTaskUpdatedFromDrawer(updated: Task) {
    setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    onTaskUpdated(updated);
  }

  // ── Mode toggle (exit edit mode clears selection) ───────────────────────────

  function toggleEditMode() {
    setIsEditMode((v) => {
      if (v) setSelectedTaskId(null); // clear selection when leaving edit
      return !v;
    });
  }

  // ── View mode panel data ────────────────────────────────────────────────────

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedMember = selectedTask ? resolvedMember(selectedTask.id) : null;
  const activeMembers = teamMembers.filter((m) => m.status === "active");
  const STATUSES: Status[] = ["Not Started", "Ready", "In Progress", "On Hold", "Complete", "Cancelled"];

  async function handleStatusChange(status: Status) {
    if (!selectedTask) return;
    setSaving(true);
    try {
      const updated = await updateTask(token, selectedTask.id, { status });
      handleTaskUpdatedFromDrawer(updated);
    } finally { setSaving(false); }
  }

  async function handleAssigneeChange(userId: string | null) {
    if (!selectedTask) return;
    setSaving(true);
    try {
      const updated = await updateTask(token, selectedTask.id, { assigned_to: userId });
      handleTaskUpdatedFromDrawer(updated);
    } finally { setSaving(false); }
  }

  function memberDisplayName(m: TeamMember) {
    return `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
  }

  const outgoingLinks = selectedTask ? links.filter((l) => l.from_task_id === selectedTask.id) : [];

  return (
    <div className="w-full h-full flex overflow-hidden">
      {/* React Flow canvas */}
      <div className="flex-1 relative overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={() => setSelectedTaskId(null)}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onEdgesDelete={handleEdgesDelete}
          onReconnectStart={handleReconnectStart}
          onReconnect={handleReconnect}
          onReconnectEnd={handleReconnectEnd}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={isEditMode ? "Backspace" : null}
          edgesReconnectable={isEditMode}
          nodesDraggable={isEditMode}
          nodesConnectable={isEditMode}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} color="#e5e7eb" />
          <Controls showInteractive={false} position="bottom-left" />

          {/* View/Edit toggle — top right */}
          <Panel position="top-right">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => { if (isEditMode) toggleEditMode(); }}
                className={`px-3 py-1.5 transition-colors ${!isEditMode ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => { if (!isEditMode) toggleEditMode(); }}
                className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${isEditMode ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064L11.19 6.25Z" />
                </svg>
                Edit
              </button>
            </div>
          </Panel>

          {/* Edit mode toolbar — top left (below legend) */}
          {isEditMode && (
            <Panel position="top-left">
              <div className="space-y-2">
                {/* Legend */}
                <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] text-slate-500 shadow-sm flex items-center gap-3">
                  <span><span className="inline-block w-3 h-0.5 bg-emerald-500 mr-1 align-middle rounded" /></span>active path
                  <span><span className="inline-block w-3 h-0.5 bg-slate-400 mr-1 align-middle rounded" /></span>pending
                  <span><span className="inline-block w-3 h-0.5 bg-slate-400 mr-1 align-middle rounded" style={{ opacity: 0.4 }} /></span>loop
                </div>
                {/* Edit toolbar */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddStep(true)}
                    className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 shadow-sm transition-colors"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
                    </svg>
                    Add step
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWorkItemPicker(true)}
                    className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 shadow-sm transition-colors"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M2 2.75A2.75 2.75 0 0 1 4.75 0h6.5A2.75 2.75 0 0 1 14 2.75v10.5A2.75 2.75 0 0 1 11.25 16h-6.5A2.75 2.75 0 0 1 2 13.25Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V2.75c0-.69-.56-1.25-1.25-1.25ZM8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4Z" />
                    </svg>
                    From Library
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAutoArrange()}
                    className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
                    title="Auto-arrange"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M8 2a.75.75 0 0 1 .553.244l4.25 4.5a.75.75 0 0 1-1.106 1.012L8 3.836 4.303 7.756a.75.75 0 0 1-1.106-1.012l4.25-4.5A.75.75 0 0 1 8 2Zm-4.553 8.256a.75.75 0 0 1 1.106 0L8 14.164l3.447-3.908a.75.75 0 1 1 1.106 1.012l-4 4.536a.75.75 0 0 1-1.106 0l-4-4.536a.75.75 0 0 1 0-1.012Z" />
                    </svg>
                    Auto-arrange
                  </button>
                  {workflow.team_id && (
                    <button
                      type="button"
                      onClick={() => setShowImportTemplate(true)}
                      className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 shadow-sm transition-colors"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M8.75 1.75a.75.75 0 0 0-1.5 0v5.69L5.03 5.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 7.44V1.75ZM3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                      </svg>
                      Import template
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {/* View mode legend (when not in edit mode) */}
          {!isEditMode && (
            <Panel position="top-left">
              <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] text-slate-500 shadow-sm flex items-center gap-3">
                <span><span className="inline-block w-3 h-0.5 bg-emerald-500 mr-1 align-middle rounded" /></span>active path
                <span><span className="inline-block w-3 h-0.5 bg-slate-400 mr-1 align-middle rounded" /></span>pending
                <span><span className="inline-block w-3 h-0.5 bg-slate-400 mr-1 align-middle rounded" style={{ opacity: 0.4 }} /></span>loop
              </div>
            </Panel>
          )}

          {/* View mode: compact floating task panel */}
          {!isEditMode && selectedTask && (
            <Panel position="top-right" style={{ marginTop: "48px" }}>
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3 w-64">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{selectedTask.name}</p>
                    {selectedTask.description && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{selectedTask.description}</p>
                    )}
                  </div>
                  <button type="button" onClick={() => setSelectedTaskId(null)} className="text-slate-400 hover:text-slate-600 shrink-0 transition-colors">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Status</label>
                    <select value={selectedTask.status} onChange={(e) => void handleStatusChange(e.target.value as Status)} disabled={saving}
                      className="w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Assignee</label>
                    <div className="flex items-center gap-2">
                      {selectedMember?.user.avatar_url && (
                        <img src={selectedMember.user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      <select value={selectedTask.assigned_to ?? ""} onChange={(e) => void handleAssigneeChange(e.target.value || null)} disabled={saving}
                        className="flex-1 text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50">
                        <option value="">Unassigned</option>
                        {activeMembers.map((m) => <option key={m.user.id} value={m.user.id}>{memberDisplayName(m)}</option>)}
                      </select>
                    </div>
                  </div>
                  {resolvedRoles(selectedTask.id).length > 0 && (
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Roles</label>
                      <div className="flex flex-wrap gap-1">
                        {resolvedRoles(selectedTask.id).map((r) => (
                          <span key={r.id} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">{r.name}</span>
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

      {/* Edit mode: right-side drawer */}
      {isEditMode && selectedTask && (
        <StepEditDrawer
          task={selectedTask}
          allTasks={tasks}
          outgoingLinks={outgoingLinks}
          teamMembers={teamMembers}
          teamRoles={teamRoles}
          taskTeamRoles={localTaskTeamRoles[selectedTask.id] ?? []}
          token={token}
          onTaskUpdated={handleTaskUpdatedFromDrawer}
          onTaskDeleted={handleTaskDeleted}
          onLinkRemoved={handleLinkRemoved}
          onBranchLabelChanged={handleBranchLabelChanged}
          onClose={() => setSelectedTaskId(null)}
          onRolesUpdated={(taskId, roles) => setLocalTaskTeamRoles((prev) => ({ ...prev, [taskId]: roles }))}
        />
      )}

      {/* Modals */}
      {showAddStep && (
        <AddStepModal
          defaultType={lastTaskType}
          onAdd={handleAddStep}
          onClose={() => setShowAddStep(false)}
        />
      )}
      {showImportTemplate && workflow.team_id && (
        <ImportTemplateModal
          teamId={workflow.team_id}
          currentWorkflowId={workflow.id}
          token={token}
          onImport={handleImportTemplate}
          onClose={() => setShowImportTemplate(false)}
        />
      )}
      {showWorkItemPicker && (
        <WorkItemPickerModal
          workflowId={workflow.id}
          canvasCenter={screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })}
          token={token}
          onInstantiated={handleWorkItemInstantiated}
          onClose={() => setShowWorkItemPicker(false)}
        />
      )}
      {pendingConnection && (
        <BranchLabelModal
          fromTaskName={pendingConnection.fromTask.name}
          toTaskName={pendingConnection.toTask.name}
          onConfirm={(label) => void confirmConnect(pendingConnection.connection, label || null)}
          onCancel={() => setPendingConnection(null)}
        />
      )}
    </div>
  );
}

// ── Public export (wrapped in ReactFlowProvider) ──────────────────────────────

interface Props {
  workflow: WorkflowWithTasks;
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  taskTeamRoles: Record<string, TaskTeamRole[]>;
  token: string;
  onTaskUpdated: (task: Task) => void;
}

export default function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
