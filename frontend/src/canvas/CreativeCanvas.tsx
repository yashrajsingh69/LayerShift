/**
 * LayerShift - Master Center Creative Canvas
 * Interactive artboard with GPU-accelerated pan/zoom, coordinate synchronization,
 * vector layer compositing, transform handles, and view modes.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ProjectStore } from '../stores/useProjectStore';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider';
import { TransformControls } from '../components/TransformControls';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Grid,
  Eye,
  SlidersHorizontal,
  UploadCloud,
  Sparkles
} from 'lucide-react';

interface CreativeCanvasProps {
  store: ProjectStore;
  onOpenSampleModal?: () => void;
}

export const CreativeCanvas: React.FC<CreativeCanvasProps> = ({ store, onOpenSampleModal }) => {
  const {
    project,
    selectedLayer,
    selectedLayerId,
    setSelectedLayerId,
    viewMode,
    toolMode,
    zoom,
    setZoom,
    panX,
    setPanX,
    panY,
    setPanY,
    showCheckerboard,
    setShowCheckerboard,
    showGrid,
    setShowGrid,
    overlayOpacity,
    setOverlayOpacity,
    splitSliderPos,
    setSplitSliderPos,
    updateLayer
  } = store;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  // Track spacebar for panning
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        setIsSpacePressed(true);
      }
    };
    const handleUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);

  const canvasWidth = project.canvasWidth || 800;
  const canvasHeight = project.canvasHeight || 800;
  const hasImage = Boolean(project.image);

  // Wheel Zoom & Trackpad Pan
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) => Math.max(0.15, Math.min(6.0, Number((prev * zoomFactor).toFixed(2)))));
    } else {
      // Pan
      setPanX((prev) => prev - e.deltaX);
      setPanY((prev) => prev - e.deltaY);
    }
  }, [setZoom, setPanX, setPanY]);

  // Pointer Down for Pan
  const handlePointerDown = (e: React.PointerEvent) => {
    // If Space is pressed, or toolMode is 'pan', or Middle Click
    if (toolMode === 'pan' || e.button === 1 || e.buttons === 4 || isSpacePressed) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panX, y: e.clientY - panY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else if (e.target === containerRef.current || (e.target as HTMLElement).id === 'canvas-background') {
      // Clicked on empty canvas background -> deselect layer
      setSelectedLayerId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning || !panStartRef.current) return;
    setPanX(e.clientX - panStartRef.current.x);
    setPanY(e.clientY - panStartRef.current.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Center / Fit to Screen
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const padding = 60;
    const scaleX = (clientWidth - padding) / canvasWidth;
    const scaleY = (clientHeight - padding) / canvasHeight;
    const bestScale = Math.max(0.2, Math.min(1.5, Math.min(scaleX, scaleY)));
    setZoom(Number(bestScale.toFixed(2)));
    setPanX(0);
    setPanY(0);
  }, [canvasWidth, canvasHeight, setZoom, setPanX, setPanY]);

  // Reset Zoom to 100%
  const resetZoom = useCallback(() => {
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }, [setZoom, setPanX, setPanY]);

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Render SVG Layers Stack (in bottom-to-top order)
  const renderVectorLayers = () => {
    // Reverse layers so index 0 (top in list) renders on top of previous layers
    const orderedLayers = [...project.layers].reverse();

    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: overlayOpacity }}
      >
        {orderedLayers.map((layer) => {
          if (!layer.visible || layer.opacity <= 0) return null;

          const { x, y, scaleX, scaleY, rotation } = layer.transform;
          const isSelected = selectedLayerId === layer.id;

          return (
            <div
              key={layer.id}
              className="absolute inset-0 transition-opacity"
              style={{
                opacity: layer.opacity,
                mixBlendMode: layer.blendMode !== 'normal' ? layer.blendMode : undefined,
                transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
                transformOrigin: 'center center'
              }}
            >
              {/* Raw SVG Content injected */}
              <div
                className="w-full h-full [&>svg]:w-full [&>svg]:h-full pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedLayerId(layer.id);
                }}
                dangerouslySetInnerHTML={{ __html: layer.svgContent }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      id="canvas-background"
      className={`relative flex-1 h-full w-full bg-canvas overflow-hidden flex items-center justify-center select-none ${
        toolMode === 'pan' || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      } ${showGrid ? 'bg-artboard-grid' : ''}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Floating Canvas Quick Controls (Top-Right of Canvas) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 p-1 bg-surface-panel/90 backdrop-blur-md border border-border/80 rounded-lg shadow-elevated">
        <button
          onClick={() => setShowCheckerboard(!showCheckerboard)}
          title="Toggle Checkerboard Transparency"
          className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
            showCheckerboard ? 'bg-surface-active text-accent-lime' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Checkered
        </button>
        <button
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Artboard Grid"
          className={`p-1.5 rounded transition-colors ${
            showGrid ? 'bg-surface-active text-accent-lime' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Grid size={15} />
        </button>
        <div className="w-px h-4 bg-border/80 mx-1" />
        <button
          onClick={fitToScreen}
          title="Fit Canvas to Screen"
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <Maximize2 size={15} />
        </button>
        <button
          onClick={resetZoom}
          title="Reset Zoom to 100%"
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Floating Overlay Opacity Control (Top-Left of Canvas) */}
      {project.layers.length > 0 && viewMode === 'combined' && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-surface-panel/90 backdrop-blur-md border border-border/80 rounded-lg shadow-elevated text-xs font-mono">
          <SlidersHorizontal size={13} className="text-accent-cyan" />
          <span className="text-text-muted">Overlay Opacity:</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
            className="w-20 accent-accent-cyan h-1 bg-surface-active rounded-lg cursor-pointer"
          />
          <span className="text-accent-cyan font-medium w-8 text-right">
            {Math.round(overlayOpacity * 100)}%
          </span>
        </div>
      )}

      {/* Main Artboard Container */}
      <div
        className="transition-transform duration-75 origin-center will-change-transform"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
        }}
      >
        {hasImage ? (
          viewMode === 'split-compare' && project.image ? (
            /* Split Before/After Comparison View */
            <BeforeAfterSlider
              sliderPos={splitSliderPos}
              setSliderPos={setSplitSliderPos}
              width={canvasWidth}
              height={canvasHeight}
              originalImageSrc={project.image.previewUrl}
              renderLayers={renderVectorLayers()}
            />
          ) : (
            /* Standard Artboard Canvas */
            <div
              className={`relative shadow-2xl rounded-sm border border-border/60 ${
                showCheckerboard ? 'bg-checkered' : 'bg-surface-panel'
              }`}
              style={{ width: canvasWidth, height: canvasHeight }}
            >
              {/* 1. Original Image Layer */}
              {project.image && (viewMode === 'combined' || viewMode === 'original-only') && (
                <img
                  src={project.image.previewUrl}
                  alt={project.image.filename}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              )}

              {/* 2. Vector Layers Overlay */}
              {(viewMode === 'combined' || viewMode === 'vector-only') && renderVectorLayers()}

              {/* 3. Transform Controls on Selected Layer */}
              {selectedLayer && selectedLayer.visible && (
                <TransformControls
                  width={canvasWidth}
                  height={canvasHeight}
                  transform={selectedLayer.transform}
                  onTransformChange={(newT) => updateLayer(selectedLayer.id, { transform: newT })}
                  zoom={zoom}
                  locked={selectedLayer.locked}
                />
              )}
            </div>
          )
        ) : (
          /* Empty Workspace State: Clean & Actionable */
          <div className="flex flex-col items-center justify-center p-12 text-center max-w-lg border-2 border-dashed border-border/80 rounded-2xl bg-surface-panel/40 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border flex items-center justify-center text-accent-lime mb-4 shadow-glow-lime">
              <UploadCloud size={32} />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">No Artwork Uploaded</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-6">
              Upload an image, character sketch, logo, or line drawing on the left panel to begin extracting editable vector layers.
            </p>
            {onOpenSampleModal && (
              <button
                onClick={onOpenSampleModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-surface-hover hover:bg-surface-active text-accent-cyan border border-accent-cyan/30 rounded-lg text-sm font-medium transition-all shadow-sm"
              >
                <Sparkles size={16} />
                Try a Sample Sketch
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
