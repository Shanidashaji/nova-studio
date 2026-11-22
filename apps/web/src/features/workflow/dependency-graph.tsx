'use client';

import '@xyflow/react/dist/style.css';
import type { ProjectStageView, TaskView } from '@nova/shared';
import { Background, MarkerType, Position, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { useMemo } from 'react';
import { useWorkspace } from '@/store/workspace';

const STATUS_COLOR: Record<TaskView['status'], string> = {
  TODO: 'var(--line-strong)',
  IN_PROGRESS: 'var(--info)',
  BLOCKED: 'var(--critical)',
  IN_REVIEW: 'var(--attention)',
  DONE: 'var(--signal)',
};

/**
 * Task dependencies as a graph: one column per stage, prerequisite → dependent edges.
 * Open edges into unfinished work are animated so the critical path is visible at a glance.
 */
export function DependencyGraph({
  tasks,
  stages,
}: {
  tasks: TaskView[];
  stages: ProjectStageView[];
}) {
  const inspect = useWorkspace((s) => s.inspect);

  const { nodes, edges } = useMemo(() => {
    const visibleStages = stages.filter(
      (s) => s.status !== 'SKIPPED' && tasks.some((t) => t.projectStageId === s.id),
    );
    const nodes: Node[] = [];
    visibleStages.forEach((s, col) => {
      nodes.push({
        id: `stage-${s.id}`,
        position: { x: col * 210, y: 0 },
        data: { label: s.label },
        draggable: false,
        selectable: false,
        style: {
          background: 'transparent',
          border: 'none',
          color: 'var(--text-3)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          width: 180,
          padding: 0,
        },
      });
      tasks
        .filter((t) => t.projectStageId === s.id)
        .forEach((t, row) => {
          nodes.push({
            id: t.id,
            position: { x: col * 210, y: 30 + row * 64 },
            data: { label: t.title },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            style: {
              width: 180,
              fontSize: 11,
              lineHeight: '14px',
              padding: '8px 10px',
              background: 'var(--surface-2)',
              color: t.status === 'DONE' ? 'var(--text-3)' : 'var(--text)',
              border: `1px solid ${STATUS_COLOR[t.status]}`,
              borderLeftWidth: 3,
              borderRadius: 8,
              textAlign: 'left',
            },
          });
        });
    });
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const edges: Edge[] = tasks.flatMap((t) =>
      t.dependsOn
        .filter((d) => byId.has(d))
        .map((d) => {
          const open = byId.get(d)!.status !== 'DONE';
          return {
            id: `${d}->${t.id}`,
            source: d,
            target: t.id,
            animated: open,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: open ? 'var(--attention)' : 'var(--line-strong)',
            },
            style: { stroke: open ? 'var(--attention)' : 'var(--line-strong)', strokeWidth: 1.5 },
          };
        }),
    );
    return { nodes, edges };
  }, [tasks, stages]);

  return (
    <div
      className="h-80 overflow-hidden rounded-[var(--radius-md)] border border-line bg-bg"
      aria-label="Task dependency graph"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesConnectable={false}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        onNodeClick={(_, n) => !n.id.startsWith('stage-') && inspect({ type: 'task', id: n.id })}
      >
        <Background color="var(--line)" gap={16} />
      </ReactFlow>
    </div>
  );
}
