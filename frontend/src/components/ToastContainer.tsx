/**
 * LayerShift - Toast Notification Container
 * Displays non-intrusive feedback for quota limits, generation errors, and successes.
 */

import React from 'react';
import { ToastNotification } from '../types';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Clock
} from 'lucide-react';

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none">
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className={`p-3.5 rounded-xl border shadow-elevated pointer-events-auto backdrop-blur-md flex items-start gap-3 transition-all transform translate-y-0 ${
              isError
                ? 'bg-surface-panel/95 border-accent-rose/60 text-text-primary shadow-glow-cyan/10'
                : isSuccess
                ? 'bg-surface-panel/95 border-accent-lime/60 text-text-primary shadow-glow-lime/10'
                : isWarning
                ? 'bg-surface-panel/95 border-accent-amber/60 text-text-primary'
                : 'bg-surface-panel/95 border-border text-text-primary'
            }`}
          >
            {/* Status Icon */}
            <div className="shrink-0 mt-0.5">
              {isError && <AlertCircle size={17} className="text-accent-rose" />}
              {isSuccess && <CheckCircle2 size={17} className="text-accent-lime" />}
              {isWarning && <AlertTriangle size={17} className="text-accent-amber" />}
              {toast.type === 'info' && <Info size={17} className="text-accent-cyan" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-semibold leading-tight text-text-primary">
                {toast.title}
              </h5>
              <p className="text-[11px] text-text-secondary mt-1 leading-snug break-words">
                {toast.message}
              </p>

              {/* Quota retry delay countdown if present */}
              {toast.retryDelay && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] font-mono text-accent-amber">
                  <Clock size={10} />
                  <span>Suggested retry delay: ~{Math.round(toast.retryDelay)}s</span>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
