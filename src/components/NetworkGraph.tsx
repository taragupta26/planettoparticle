"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Entity, Relation } from "@/lib/types";

interface Props {
  entities: Entity[];
  relations: Relation[];
  onSelectEvidence: (ids: string[]) => void;
}

// Radial layout: resource at center, countries around it.
export default function NetworkGraph({
  entities,
  relations,
  onSelectEvidence,
}: Props) {
  const { nodes, edges } = useMemo(() => {
    const resource = entities.find((e) => e.type === "resource");
    const countries = entities.filter((e) => e.type === "country");
    const nodes: Node[] = [];
    const cx = 0;
    const cy = 0;

    if (resource) {
      nodes.push({
        id: resource.id,
        position: { x: cx, y: cy },
        data: { label: resource.label },
        style: {
          background: "#1f3c5a",
          color: "white",
          border: "2px solid #0f2438",
          borderRadius: 999,
          padding: 12,
          fontWeight: 700,
          width: 110,
          textAlign: "center" as const,
        },
      });
    }

    const R = 320;
    countries.forEach((c, i) => {
      const angle = (i / Math.max(1, countries.length)) * Math.PI * 2;
      nodes.push({
        id: c.id,
        position: { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) },
        data: { label: c.label, evidenceIds: c.evidenceIds },
        style: {
          background: "white",
          border: "1px solid #3680bd",
          borderRadius: 8,
          padding: 8,
          fontSize: 12,
          width: 150,
          textAlign: "center" as const,
        },
      });
    });

    const edges: Edge[] = relations.map((r) => ({
      id: r.id,
      source: r.from,
      target: r.to,
      label: r.label,
      animated: r.kind === "produces",
      labelStyle: { fontSize: 10, fill: "#215181" },
      labelBgStyle: { fill: "#eef6fc" },
      style: {
        stroke: r.kind === "produces" ? "#27659f" : "#92bfe2",
        strokeWidth: r.kind === "produces" ? 2 : 1.5,
        strokeDasharray: r.kind === "holds_reserves" ? "4 3" : undefined,
      },
      data: { evidenceIds: r.evidenceIds },
    }));

    return { nodes, edges };
  }, [entities, relations]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => {
          const ids = (node.data as any)?.evidenceIds as string[] | undefined;
          if (ids?.length) onSelectEvidence(ids);
        }}
        onEdgeClick={(_, edge) => {
          const ids = (edge.data as any)?.evidenceIds as string[] | undefined;
          if (ids?.length) onSelectEvidence(ids);
        }}
      >
        <Background color="#cfe0f0" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
