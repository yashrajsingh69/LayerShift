/**
 * LayerShift - Right Sidebar: Layers Inspector
 * Comprehensive layer stack management, reordering, direct opacity/visibility toggles,
 * vector geometry statistics, and coordinate transform properties.
 */

import React, { useState } from 'react';
import { ProjectStore } from '../stores/useProjectStore';
import { exportSingleLayerSVG } from '../utils/export';
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  Download,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Sparkles,
  Sliders,
  Maximize2,
  FileCode,
  Edit2,
  Check
} from 'lucide-react';
import { BlendMode } from '../types';

interface LayersInspectorProps {
  store: ProjectStore;
}

export const LayersInspector: React.FC<LayersInspectorProps> = ({ store }) => {
  const {
    project,
    selectedLayer,
    selectedLayerId,
    setSelectedLayerId,
    toggleVisibility,
    toggleLock,
    setLayerOpacity,
    deleteLayer,
    duplicateLayer,
    moveLayer,
    resetTransform,
    updateLayer,
    addToast
  } = store;

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const handleStartRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLayerId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      updateLayer(id, { name: editingName.trim() });
    }
    setEditingLayerId(null);
  };

  return (
    <aside className="w-80 h-full bg-surface-panel border-l border-border flex flex-col select-none overflow-hidden shrink-0 z-10">
      {/* Panel Header */}
      <div className="p-4 border-b border-border/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center text-accent-cyan shadow-glow-cyan">
            <Layers size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Layers Inspector</h2>
            <p className="text-[11px] text-text-secondary">
              {project.layers.length} {project.layers.length === 1 ? 'Vector Layer' : 'Vector Layers'}
            </p>
          </div>
        </div>
      </div>

      {/* Layer List / Stack */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {project.layers.length === 0 ? (
          /* Empty Layer Stack State */
          <div className="h-64 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border/70 rounded-xl bg-surface/30">
            <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-border flex items-center justify-center text-text-muted mb-3">
              <Layers size={20} />
            </div>
            <p className="text-xs font-semibold text-text-secondary mb-1">No Layers Generated</p>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Describe a feature in the generation panel to extract your first independent SVG layer.
            </p>
          </div>
        ) : (
          project.layers.map((layer, index) => {
            const isSelected = selectedLayerId === layer.id;

            return (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-surface-elevated border-accent-lime/60 shadow-glow-lime/20'
                    : 'bg-surface/60 hover:bg-surface border-border/80 hover:border-border-strong'
                }`}
              >
                {/* Layer Main Header Row */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* SVG Mini Thumbnail */}
                    <div className="w-7 h-7 rounded bg-canvas border border-border/80 flex items-center justify-center overflow-hidden shrink-0">
                      <div
                        className="w-full h-full p-0.5 [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: layer.svgContent }}
                      />
                    </div>

                    {/* Layer Name / Inline Edit */}
                    {editingLayerId === layer.id ? (
                      <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(layer.id)}
                          autoFocus
                          className="w-full px-1.5 py-0.5 bg-surface-active rounded border border-accent-lime text-xs text-text-primary outline-none"
                        />
                        <button
                          onClick={() => handleSaveRename(layer.id)}
                          className="p-1 text-accent-lime hover:bg-surface-hover rounded"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-text-primary truncate">
                            {layer.name}
                          </span>
                          <button
                            onClick={(e) => handleStartRename(layer.id, layer.name, e)}
                            className="text-text-muted hover:text-text-secondary opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                            title="Rename Layer"
                          >
                            <Edit2 size={10} />
                          </button>
                        </div>
                        <span className="text-[10px] font-mono text-accent-cyan uppercase">
                          {layer.type}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Icons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Visibility Toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }}
                      title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                      className={`p-1 rounded hover:bg-surface-hover transition-colors ${
                        layer.visible ? 'text-text-secondary hover:text-text-primary' : 'text-text-muted'
                      }`}
                    >
                      {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>

                    {/* Lock Toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }}
                      title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                      className={`p-1 rounded hover:bg-surface-hover transition-colors ${
                        layer.locked ? 'text-accent-amber' : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>

                    {/* Export SVG Single Layer */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportSingleLayerSVG(layer, project.name);
                        addToast({ type: 'success', title: 'Exported', message: `Downloaded ${layer.name}.svg` });
                      }}
                      title="Download SVG Layer"
                      className="p-1 rounded text-text-secondary hover:text-accent-lime hover:bg-surface-hover transition-colors"
                    >
                      <Download size={13} />
                    </button>
                  </div>
                </div>

                {/* Layer Opacity Slider & Reorder Row */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                  <div className="flex items-center gap-2 flex-1 mr-3">
                    <span className="text-[10px] text-text-muted font-mono">Opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={layer.opacity}
                      onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full accent-accent-lime h-1 bg-surface-active rounded cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-text-secondary w-7 text-right">
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>

                  {/* Reorder Buttons */}
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => moveLayer(layer.id, 'up')}
                      disabled={index === 0}
                      title="Move Layer Up"
                      className="p-1 rounded text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      onClick={() => moveLayer(layer.id, 'down')}
                      disabled={index === project.layers.length - 1}
                      title="Move Layer Down"
                      className="p-1 rounded text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      onClick={() => duplicateLayer(layer.id)}
                      title="Duplicate Layer"
                      className="p-1 rounded text-text-muted hover:text-accent-cyan transition-colors"
                    >
                      <Copy size={11} />
                    </button>
                    <button
                      onClick={() => deleteLayer(layer.id)}
                      title="Delete Layer"
                      className="p-1 rounded text-text-muted hover:text-accent-rose transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected Layer Properties Inspector (Bottom Half of Sidebar) */}
      {selectedLayer && (
        <div className="p-4 border-t border-border bg-surface/70 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <Sliders size={13} className="text-accent-lime" />
              Transform & Blend
            </span>
            <button
              onClick={() => resetTransform(selectedLayer.id)}
              className="text-[11px] text-text-muted hover:text-accent-cyan flex items-center gap-1 transition-colors"
              title="Reset position and rotation to default"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>

          {/* Coordinate Inputs: Position X, Y */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] text-text-muted block mb-1 font-mono">Pos X (px)</label>
              <input
                type="number"
                value={selectedLayer.transform.x}
                onChange={(e) =>
                  updateLayer(selectedLayer.id, {
                    transform: { ...selectedLayer.transform, x: Number(e.target.value) || 0 }
                  })
                }
                className="w-full px-2 py-1 bg-surface rounded border border-border text-xs text-text-primary font-mono focus:border-accent-lime outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1 font-mono">Pos Y (px)</label>
              <input
                type="number"
                value={selectedLayer.transform.y}
                onChange={(e) =>
                  updateLayer(selectedLayer.id, {
                    transform: { ...selectedLayer.transform, y: Number(e.target.value) || 0 }
                  })
                }
                className="w-full px-2 py-1 bg-surface rounded border border-border text-xs text-text-primary font-mono focus:border-accent-lime outline-none"
              />
            </div>
          </div>

          {/* Scale & Rotation */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] text-text-muted block mb-1 font-mono">Scale</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="5"
                value={selectedLayer.transform.scaleX}
                onChange={(e) => {
                  const val = Number(e.target.value) || 1;
                  updateLayer(selectedLayer.id, {
                    transform: { ...selectedLayer.transform, scaleX: val, scaleY: val }
                  });
                }}
                className="w-full px-2 py-1 bg-surface rounded border border-border text-xs text-text-primary font-mono focus:border-accent-lime outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1 font-mono">Rotation (°)</label>
              <input
                type="number"
                value={selectedLayer.transform.rotation}
                onChange={(e) =>
                  updateLayer(selectedLayer.id, {
                    transform: { ...selectedLayer.transform, rotation: Number(e.target.value) || 0 }
                  })
                }
                className="w-full px-2 py-1 bg-surface rounded border border-border text-xs text-text-primary font-mono focus:border-accent-lime outline-none"
              />
            </div>
          </div>

          {/* Blend Mode Selector */}
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Blend Mode</label>
            <select
              value={selectedLayer.blendMode}
              onChange={(e) => updateLayer(selectedLayer.id, { blendMode: e.target.value as BlendMode })}
              className="w-full px-2 py-1.5 bg-surface rounded border border-border text-xs text-text-primary focus:border-accent-lime outline-none"
            >
              <option value="normal">Normal</option>
              <option value="multiply">Multiply (Darken strokes)</option>
              <option value="screen">Screen (Lighten)</option>
              <option value="overlay">Overlay (High Contrast)</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
            </select>
          </div>

          {/* Vector Metadata Statistics */}
          {selectedLayer.metadata && (
            <div className="pt-2 border-t border-border/50 text-[11px] text-text-muted space-y-1">
              <div className="flex justify-between font-mono">
                <span>Vector Elements:</span>
                <span className="text-text-secondary">{selectedLayer.metadata.element_count || 0}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span>Paths / Shapes:</span>
                <span className="text-text-secondary">
                  {selectedLayer.metadata.path_count || 0} paths • {selectedLayer.metadata.shape_count || 0} shapes
                </span>
              </div>
              <div className="flex justify-between font-mono">
                <span>Complexity Score:</span>
                <span className="text-accent-cyan font-medium">
                  {selectedLayer.metadata.complexity_score || 0} pts
                </span>
              </div>
              {selectedLayer.metadata.is_repaired && (
                <div className="text-[10px] text-accent-amber font-mono pt-1">
                  • Repaired by AI Self-Correction
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
