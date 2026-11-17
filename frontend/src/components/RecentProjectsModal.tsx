/**
 * LayerShift - Recent Projects Modal
 * Lists and manages projects stored in IndexedDB.
 */

import React, { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { Project } from '../types';
import {
  X,
  Clock,
  FolderOpen,
  Trash2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

interface RecentProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: Project) => void;
}

export const RecentProjectsModal: React.FC<RecentProjectsModalProps> = ({
  isOpen,
  onClose,
  onSelectProject
}) => {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; updatedAt: number; layerCount: number; thumbnail?: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadList();
    }
  }, [isOpen]);

  const loadList = async () => {
    setLoading(true);
    try {
      const list = await storage.listProjects();
      setProjects(list);
    } catch (e) {
      console.error('Failed to load recent projects:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (id: string) => {
    try {
      const p = await storage.getProject(id);
      if (p) {
        onSelectProject(p);
        onClose();
      }
    } catch (e) {
      console.error('Failed to open project:', e);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await storage.deleteProject(id);
      await loadList();
    } catch (e) {
      console.error('Failed to delete project:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg bg-surface-panel border border-border rounded-2xl shadow-elevated overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent-cyan">
              <Clock size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Recent Projects</h3>
              <p className="text-[11px] text-text-secondary">IndexedDB Local Persistence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-xs text-text-muted text-center py-8">Loading saved projects...</p>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border/70 rounded-xl bg-surface/30">
              <FolderOpen size={28} className="text-text-muted mx-auto mb-2" />
              <p className="text-xs font-medium text-text-secondary">No Saved Projects Yet</p>
              <p className="text-[11px] text-text-muted mt-1">
                Your artwork and generated vector layers will automatically save here.
              </p>
            </div>
          ) : (
            projects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => handleOpen(proj.id)}
                className="p-3 bg-surface hover:bg-surface-elevated border border-border/80 hover:border-accent-cyan/60 rounded-xl cursor-pointer flex items-center justify-between transition-all group shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-lg bg-canvas border border-border/80 overflow-hidden flex items-center justify-center shrink-0">
                    {proj.thumbnail ? (
                      <img src={proj.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Layers size={16} className="text-text-muted" />
                    )}
                  </div>
                  <div className="truncate min-w-0">
                    <h4 className="text-xs font-semibold text-text-primary truncate group-hover:text-accent-cyan transition-colors">
                      {proj.name}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(proj.updatedAt).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span>{proj.layerCount} {proj.layerCount === 1 ? 'layer' : 'layers'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={(e) => handleDelete(proj.id, e)}
                    title="Delete project"
                    className="p-1.5 rounded-lg text-text-muted hover:text-accent-rose hover:bg-surface transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                  <div className="p-1.5 text-text-muted group-hover:text-accent-cyan transition-colors">
                    <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
