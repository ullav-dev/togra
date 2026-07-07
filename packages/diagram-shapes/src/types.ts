export type ShapeType = "rect" | "circle" | "diamond" | "database" | "cloud" | "actor" | "image";

export type ShapePort = "top" | "right" | "bottom" | "left";

export interface ShapePortPoint {
  x: number;
  y: number;
  port: ShapePort;
}

export interface BoardShape {
  id: string;
  board_id: string;
  shape_type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill_color: string;
  stroke_color: string;
  stroke_width: number;
  label: string | null;
  label_color: string;
  label_size: number;
  image_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBoardShape {
  shape_type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill_color?: string;
  stroke_color?: string;
  stroke_width?: number;
  label?: string;
  label_color?: string;
  label_size?: number;
  image_url?: string;
}

export interface UpdateBoardShape {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill_color?: string;
  stroke_color?: string;
  stroke_width?: number;
  label?: string | null;
  label_color?: string;
  label_size?: number;
  // null is a no-op server-side (the column is only ever COALESCE-replaced, never cleared)
  image_url?: string | null;
}

export const DEFAULT_SHAPE_SIZES: Record<ShapeType, { width: number; height: number }> = {
  rect:     { width: 160, height: 100 },
  circle:   { width: 120, height: 120 },
  diamond:  { width: 140, height: 120 },
  database: { width: 120, height: 140 },
  cloud:    { width: 180, height: 120 },
  actor:    { width:  80, height: 140 },
  image:    { width: 220, height: 160 },
};
