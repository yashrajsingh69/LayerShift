/**
 * LayerShift - Interactive Split Before/After Comparison Slider
 * Allows side-by-side visual comparison between original artwork and AI vector layers.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Columns, SplitSquareVertical } from 'lucide-react';

interface BeforeAfterSliderProps {
  sliderPos: number; // 0 to 100
  setSliderPos: (pos: number) => void;
  width: number;
  height: number;
  originalImageSrc: string;
  renderLayers: React.ReactNode;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  sliderPos,
  setSliderPos,
  width,
  height,
  originalImageSrc,
  renderLayers
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  }, [isDragging, setSliderPos]);

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-hidden rounded-lg shadow-2xl border border-border"
      style={{ width, height }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Background (Right side): Generated Vector Layers */}
      <div className="absolute inset-0 bg-checkered flex items-center justify-center">
        {renderLayers}
        <span className="absolute bottom-3 right-3 px-2 py-1 bg-surface-panel/80 backdrop-blur border border-border/60 rounded text-[10px] font-mono font-medium text-accent-lime uppercase tracking-wider">
          Vector Layer
        </span>
      </div>

      {/* Foreground (Left side): Original Image (Clipped by slider position) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ width: `${sliderPos}%` }}
      >
        <div style={{ width, height }} className="relative bg-surface">
          <img
            src={originalImageSrc}
            alt="Original artwork"
            className="w-full h-full object-contain"
            draggable={false}
          />
          <span className="absolute bottom-3 left-3 px-2 py-1 bg-surface-panel/80 backdrop-blur border border-border/60 rounded text-[10px] font-mono font-medium text-text-secondary uppercase tracking-wider">
            Original Art
          </span>
        </div>
      </div>

      {/* Divider Line & Drag Handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-accent-lime cursor-ew-resize z-30"
        style={{ left: `${sliderPos}%` }}
        onPointerDown={handlePointerDown}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-surface-panel border-2 border-accent-lime shadow-lg flex items-center justify-center text-accent-lime hover:scale-110 active:scale-95 transition-transform">
          <Columns size={14} className="stroke-[2.5]" />
        </div>
      </div>
    </div>
  );
};
