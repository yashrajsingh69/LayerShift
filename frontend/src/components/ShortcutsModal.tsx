/**
 * LayerShift - Keyboard Shortcuts & Creative Workflow Guide Modal
 */

import React from 'react';
import { X, Command, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Ctrl + Z', desc: 'Undo last action' },
    { key: 'Ctrl + Shift + Z', desc: 'Redo previously reverted action' },
    { key: 'Delete / Backspace', desc: 'Delete currently selected layer' },
    { key: 'Space + Drag', desc: 'Pan canvas workspace freely' },
    { key: 'Ctrl + Wheel', desc: 'Smooth zoom to pointer coordinate' },
    { key: '+ / -', desc: 'Zoom in / Zoom out canvas' },
    { key: '0', desc: 'Fit artboard canvas to viewport' },
    { key: 'V', desc: 'Activate Selection & Transform tool' },
    { key: 'H', desc: 'Activate Pan Hand tool' },
    { key: 'Z', desc: 'Activate Zoom tool' },
    { key: 'Escape', desc: 'Deselect active layer / Close modals' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
      <div className="w-full max-w-md bg-surface-panel border border-border rounded-2xl shadow-elevated overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent-cyan">
              <Keyboard size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h3>
              <p className="text-[11px] text-text-secondary">Pro Creative Workspace Shortcuts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {shortcuts.map((sc, index) => (
            <div
              key={index}
              className="p-2 bg-surface rounded-xl border border-border/70 flex items-center justify-between text-xs"
            >
              <span className="text-text-secondary">{sc.desc}</span>
              <kbd className="px-2 py-1 bg-surface-elevated border border-border rounded-md font-mono text-[11px] text-accent-lime font-medium shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-surface/50 text-center">
          <p className="text-[11px] text-text-muted">
            LayerShift philosophy: "Generate Editable Layers, Not Flat Pixels."
          </p>
        </div>
      </div>
    </div>
  );
};
