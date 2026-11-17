/**
 * LayerShift - Core TypeScript Definitions
 * Generate Editable Layers, Not Flat Pixels.
 */

export type LayerType = 'outline' | 'line-art' | 'flat-color' | 'details' | 'background' | 'custom';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export interface LayerTransform {
  x: number;          // Translation offset X in pixels
  y: number;          // Translation offset Y in pixels
  scaleX: number;     // Scale multiplier X (default 1.0)
  scaleY: number;     // Scale multiplier Y (default 1.0)
  rotation: number;   // Rotation angle in degrees
}

export interface LayerMetadata {
  element_count?: number;
  path_count?: number;
  shape_count?: number;
  group_count?: number;
  complexity_score?: number;
  generation_duration_ms?: number;
  model?: string;
  is_repaired?: boolean;
  viewBox?: string;
  generation_mode?: string;
  engine?: string;
  target_region?: string;
  timing?: {
    preprocessing_ms?: number;
    vision_analysis_ms?: number;
    vector_synthesis_ms?: number;
    validation_ms?: number;
    total_ms?: number;
  };
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  svgContent: string;        // Clean SVG markup for rendering
  exportSvg?: string;        // Formatted SVG with standalone header for file download
  visible: boolean;
  locked: boolean;
  opacity: number;           // 0.0 to 1.0
  transform: LayerTransform;
  blendMode: BlendMode;
  metadata: LayerMetadata;
  createdAt: number;
}

export interface ImageSource {
  filename: string;
  previewUrl: string;        // Object URL or data URL
  base64Data?: string;       // Persistent Base64 for IndexedDB / Project export
  width: number;
  height: number;
  aspectRatio: number;
  mimeType: string;
  fileSize?: number;
  fileObject?: File;         // In-memory File for FormData upload
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  image: ImageSource | null;
  layers: Layer[];
  canvasWidth: number;
  canvasHeight: number;
}

export type ViewMode = 'combined' | 'vector-only' | 'original-only' | 'split-compare';

export type ToolMode = 'select' | 'pan' | 'zoom';

export interface GenerationSettings {
  layerName: string;
  layerType: LayerType;
  generationMode: 'quick' | 'precise' | 'advanced';
  detailLevel: 'minimal' | 'balanced' | 'high' | 'intricate';
  vectorComplexity: 'low' | 'medium' | 'high';
  colorPreservation: boolean;
}

export type GenerationStage = 
  | 'idle'
  | 'preparing'
  | 'analyzing'
  | 'understanding'
  | 'generating'
  | 'validating'
  | 'rendering'
  | 'complete'
  | 'error';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  retryDelay?: number;
  duration?: number;
}

export interface SampleArtwork {
  id: string;
  name: string;
  category: string;
  suggested_prompt: string;
  test_prompts?: string[];
  width: number;
  height: number;
  svg_data?: string;
  filename?: string;
  url?: string;
}
