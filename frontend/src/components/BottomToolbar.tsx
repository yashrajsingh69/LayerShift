/**
 * LayerShift - Bottom Workspace Toolbar
 * Artboard metadata, zoom percentage controls, tool modes, and Gemini status.
 */

import React from 'react';
import { ProjectStore } from '../stores/useProjectStore';
import {
  MousePointer,
  Hand,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Cpu,
  Layers
} from 'lucide-react';
import { ToolMode } from '../types';

interface BottomToolbarProps {
  store: ProjectStore;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({ store }) => {
  const {
    zoom,
    setZoom,
    toolMode,
    setToolMode,
    project,
    selectedLayer
  } = store;

  const canvasWidth = project.canvasWidth || 800;
  const canvasHeight = project.canvasHeight || 800;

  return (
    <footer className="h-9 w-full bg-surface-panel border-t border-border flex items-center justify-between px-4 select-none shrink-0 z-20 text-[11px] font-mono text-text-secondary">
      {/* Left: Active Tool Selector */}
      <div className="flex items-center gap-1">
        <div className="flex items-center p-0.5 bg-surface rounded-md border border-border/60">
          <button
            onClick={() => setToolMode('select')}
            title="Select & Transform Tool (V)"
            className={`p-1 rounded transition-colors ${
              toolMode === 'select'
                ? 'bg-surface-panel text-accent-lime shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <MousePointer size={13} />
          </button>
          <button
            onClick={() => setToolMode('pan')}
            title="Pan Hand Tool (H / Space+Drag)"
            className={`p-1 rounded transition-colors ${
              toolMode === 'pan'
                ? 'bg-surface-panel text-accent-lime shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Hand size={13} />
          </button>
          <button
            onClick={() => setToolMode('zoom')}
            title="Zoom Tool (Z)"
            className={`p-1 rounded transition-colors ${
              toolMode === 'zoom'
                ? 'bg-surface-panel text-accent-lime shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Search size={13} />
          </button>
        </div>

        <div className="w-px h-3.5 bg-border/60 mx-1.5" />

        {/* Selected Layer Info */}
        <div className="flex items-center gap-1.5 text-text-muted truncate max-w-xs">
          {selectedLayer ? (
            <>
              <Layers size={12} className="text-accent-cyan shrink-0" />
              <span className="text-text-primary truncate">{selectedLayer.name}</span>
              <span className="text-[10px] text-text-muted">
                ({selectedLayer.metadata?.element_count || 0} elements)
              </span>
            </>
          ) : (
            <span>No layer selected</span>
          )}
        </div>
      </div>

      {/* Center: Canvas Dimensions */}
      <div className="hidden md:flex items-center gap-2 text-text-muted">
        <span>Artboard:</span>
        <span className="text-text-secondary font-medium">
          {canvasWidth} × {canvasHeight} px
        </span>
        <span className="text-[10px]">({Math.round((canvasWidth / canvasHeight) * 100) / 100}:1)</span>
      </div>

      {/* Right: Zoom % Controls & Mode Status */}
      <div className="flex items-center gap-2.5">
        {/* Active Mode Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface/80 border border-border/60 text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-lime animate-pulse" />
          <span className="text-text-secondary capitalize font-semibold">
            {store.generationSettings.generationMode} Mode
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-surface px-1.5 py-0.5 rounded border border-border/60">
          <button
            onClick={() => setZoom(Math.max(0.15, Number((zoom - 0.1).toFixed(2))))}
            title="Zoom Out (-)"
            className="p-0.5 text-text-muted hover:text-text-primary rounded"
          >
            <ZoomOut size={12} />
          </button>

          <span className="w-11 text-center font-medium text-text-primary">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={() => setZoom(Math.min(6.0, Number((zoom + 0.1).toFixed(2))))}
            title="Zoom In (+)"
            className="p-0.5 text-text-muted hover:text-text-primary rounded"
          >
            <ZoomIn size={12} />
          </button>
        </div>
      </div>
    </footer>
  );
};
