/**
 * LayerShift - Top Navigation Bar
 * Branding, project naming, save state, undo/redo, view modes, export pipeline, and settings.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ProjectStore } from '../stores/useProjectStore';
import {
  exportSingleLayerSVG,
  exportAllLayersZip,
  exportCompositionPNG,
  exportProjectJSON,
  importProjectJSON
} from '../utils/export';
import {
  Layers,
  Undo2,
  Redo2,
  Download,
  Settings,
  HelpCircle,
  FolderOpen,
  Plus,
  Check,
  ChevronDown,
  Sparkles,
  FileCode,
  Archive,
  Image,
  Upload,
  Clock
} from 'lucide-react';
import { ViewMode } from '../types';

interface NavbarProps {
  store: ProjectStore;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenRecentProjects: () => void;
  onOpenSamples: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  store,
  onOpenSettings,
  onOpenShortcuts,
  onOpenRecentProjects,
  onOpenSamples
}) => {
  const {
    project,
    renameProject,
    saveStatus,
    undo,
    redo,
    canUndo,
    canRedo,
    viewMode,
    setViewMode,
    selectedLayer,
    newProject,
    loadProject,
    addToast
  } = store;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.name);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Sync title input with store
  useEffect(() => {
    setTitleInput(project.name);
  }, [project.name]);

  // Click outside to close export menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTitleSubmit = () => {
    if (titleInput.trim()) {
      renameProject(titleInput.trim());
    } else {
      setTitleInput(project.name);
    }
    setIsEditingTitle(false);
  };

  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const imported = importProjectJSON(content);
        loadProject(imported);
        addToast({
          type: 'success',
          title: 'Project Imported',
          message: `Successfully loaded "${imported.name}" with ${imported.layers.length} layers.`
        });
      } catch (err: any) {
        addToast({
          type: 'error',
          title: 'Import Failed',
          message: err.message || 'Invalid .layershift project file'
        });
      }
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  return (
    <header className="h-13 w-full bg-surface-panel border-b border-border flex items-center justify-between px-4 select-none shrink-0 z-30">
      {/* Left: Branding & Project Title */}
      <div className="flex items-center gap-4">
        {/* LayerShift Brand Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center shadow-panel">
            <svg className="w-5 h-5" viewBox="0 0 32 32">
              <path d="M8 11 L16 7 L24 11 L16 15 Z" fill="#62D9E8" />
              <path d="M8 16 L16 20 L24 16" stroke="#C7FF4A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M8 21 L16 25 L24 21" stroke="#C7FF4A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-extrabold tracking-tight text-text-primary text-base">
              Layer<span className="text-accent-lime">Shift</span>
            </span>
            <span className="text-[10px] font-mono text-text-muted hidden md:inline px-1.5 py-0.5 rounded bg-surface border border-border/60">
              v1.0
            </span>
          </div>
        </div>

        <div className="w-px h-5 bg-border/80" />

        {/* Project Name & Status */}
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                autoFocus
                className="px-2 py-0.5 bg-surface text-xs font-medium text-text-primary border border-accent-lime rounded outline-none"
              />
              <button
                onClick={handleTitleSubmit}
                className="p-1 text-accent-lime hover:bg-surface-hover rounded"
              >
                <Check size={13} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              title="Click to rename project"
              className="px-2 py-1 rounded hover:bg-surface-hover cursor-pointer flex items-center gap-1.5 group transition-colors"
            >
              <span className="text-xs font-semibold text-text-primary max-w-44 truncate">
                {project.name}
              </span>
            </div>
          )}

          {/* Autosave Status Pill */}
          <span className="text-[10px] font-mono text-text-muted flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface/50 border border-border/40">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                saveStatus === 'saved'
                  ? 'bg-accent-lime'
                  : saveStatus === 'saving'
                  ? 'bg-accent-amber animate-pulse'
                  : 'bg-text-muted'
              }`}
            />
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'unsaved' && 'Unsaved'}
          </span>
        </div>

        {/* Undo / Redo Controls */}
        <div className="flex items-center gap-0.5 ml-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Redo2 size={15} />
          </button>
        </div>
      </div>

      {/* Center: View Mode Segmented Controls */}
      <div className="hidden lg:flex items-center p-1 bg-surface rounded-xl border border-border/80 shadow-inner">
        {[
          { id: 'combined', label: 'Combined' },
          { id: 'vector-only', label: 'Vector Only' },
          { id: 'original-only', label: 'Original' },
          { id: 'split-compare', label: 'Split Slider' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id as ViewMode)}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              viewMode === tab.id
                ? 'bg-surface-panel text-accent-lime shadow-panel font-semibold border border-border/60'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right: Project Actions, Samples, Export & Settings */}
      <div className="flex items-center gap-2">
        {/* Sample Artworks Trigger */}
        <button
          onClick={onOpenSamples}
          title="Try Sample Artwork"
          className="px-2.5 py-1.5 bg-surface hover:bg-surface-hover text-accent-cyan border border-accent-cyan/30 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm"
        >
          <Sparkles size={13} />
          <span className="hidden sm:inline">Samples</span>
        </button>

        {/* Recent Projects Modal Trigger */}
        <button
          onClick={onOpenRecentProjects}
          title="Recent Projects"
          className="p-2 rounded-lg bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border transition-colors"
        >
          <Clock size={15} />
        </button>

        {/* New Project Button */}
        <button
          onClick={newProject}
          title="Create New Project"
          className="p-2 rounded-lg bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border transition-colors"
        >
          <Plus size={15} />
        </button>

        {/* Export Dropdown Menu */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="px-3 py-1.5 bg-accent-lime hover:bg-accent-lime-hover text-surface font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-glow-lime active:scale-[0.98]"
          >
            <Download size={14} />
            <span>Export</span>
            <ChevronDown size={13} />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-56 p-1.5 bg-surface-panel border border-border rounded-xl shadow-elevated z-50 space-y-1 text-xs">
              {/* Export Selected Layer */}
              <button
                onClick={() => {
                  if (selectedLayer) {
                    exportSingleLayerSVG(selectedLayer, project.name);
                    addToast({ type: 'success', title: 'Exported', message: `Downloaded ${selectedLayer.name}.svg` });
                  } else {
                    addToast({ type: 'warning', title: 'No Layer Selected', message: 'Select a vector layer to export as SVG' });
                  }
                  setShowExportMenu(false);
                }}
                disabled={!selectedLayer}
                className="w-full px-3 py-2 rounded-lg hover:bg-surface text-left flex items-center gap-2 text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FileCode size={15} className="text-accent-lime" />
                <div>
                  <div className="font-medium">Export Selected SVG</div>
                  <div className="text-[10px] text-text-muted">Download active layer as .svg</div>
                </div>
              </button>

              {/* Export All Layers ZIP */}
              <button
                onClick={async () => {
                  if (project.layers.length > 0) {
                    await exportAllLayersZip(project.layers, project.name);
                    addToast({ type: 'success', title: 'ZIP Archive Exported', message: `Bundled ${project.layers.length} SVG layers` });
                  } else {
                    addToast({ type: 'warning', title: 'No Layers', message: 'No vector layers to export' });
                  }
                  setShowExportMenu(false);
                }}
                disabled={project.layers.length === 0}
                className="w-full px-3 py-2 rounded-lg hover:bg-surface text-left flex items-center gap-2 text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Archive size={15} className="text-accent-cyan" />
                <div>
                  <div className="font-medium">Export All Layers (.zip)</div>
                  <div className="text-[10px] text-text-muted">Package all layers in archive</div>
                </div>
              </button>

              {/* Export PNG Composite */}
              <button
                onClick={async () => {
                  try {
                    await exportCompositionPNG(project);
                    addToast({ type: 'success', title: 'PNG Exported', message: 'Full composition rendered to image' });
                  } catch (e: any) {
                    addToast({ type: 'error', title: 'PNG Export Error', message: e.message });
                  }
                  setShowExportMenu(false);
                }}
                className="w-full px-3 py-2 rounded-lg hover:bg-surface text-left flex items-center gap-2 text-text-primary transition-colors"
              >
                <Image size={15} className="text-accent-amber" />
                <div>
                  <div className="font-medium">Export Composite (.png)</div>
                  <div className="text-[10px] text-text-muted">Flattened high-res PNG</div>
                </div>
              </button>

              <div className="h-px bg-border/60 my-1" />

              {/* Export Project JSON */}
              <button
                onClick={() => {
                  exportProjectJSON(project);
                  addToast({ type: 'success', title: 'Project Saved', message: 'Downloaded .layershift package' });
                  setShowExportMenu(false);
                }}
                className="w-full px-3 py-2 rounded-lg hover:bg-surface text-left flex items-center gap-2 text-text-primary transition-colors"
              >
                <FolderOpen size={15} className="text-text-secondary" />
                <div>
                  <div className="font-medium">Save Project File</div>
                  <div className="text-[10px] text-text-muted">Export .layershift document</div>
                </div>
              </button>

              {/* Import Project JSON */}
              <button
                onClick={() => {
                  importFileRef.current?.click();
                  setShowExportMenu(false);
                }}
                className="w-full px-3 py-2 rounded-lg hover:bg-surface text-left flex items-center gap-2 text-text-primary transition-colors"
              >
                <Upload size={15} className="text-text-secondary" />
                <div>
                  <div className="font-medium">Open Project File...</div>
                  <div className="text-[10px] text-text-muted">Restore .layershift package</div>
                </div>
              </button>
            </div>
          )}
        </div>

        <input
          ref={importFileRef}
          type="file"
          accept=".layershift,.json"
          className="hidden"
          onChange={handleImportProject}
        />

        {/* Shortcuts Modal Trigger */}
        <button
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts"
          className="p-2 rounded-lg bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border transition-colors"
        >
          <HelpCircle size={15} />
        </button>

        {/* Settings Modal Trigger */}
        <button
          onClick={onOpenSettings}
          title="Settings & API Key"
          className="p-2 rounded-lg bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border transition-colors"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
