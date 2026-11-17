/**
 * LayerShift - Transform Bounding Box Controls
 * Direct manipulation overlay for moving, scaling, and rotating vector layers on the canvas.
 */

import React, { useState, useRef, useEffect } from 'react';
import { LayerTransform } from '../types';
import { RotateCw } from 'lucide-react';

interface TransformControlsProps {
  width: number;
  height: number;
  transform: LayerTransform;
  onTransformChange: (newTransform: LayerTransform) => void;
  zoom: number;
  locked?: boolean;
}

export const TransformControls: React.FC<TransformControlsProps> = ({
  width,
  height,
  transform,
  onTransformChange,
  zoom,
  locked = false
}) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const startPosRef = useRef<{ clientX: number; clientY: number; initialTransform: LayerTransform } | null>(null);

  const { x, y, scaleX, scaleY, rotation } = transform;

  const handlePointerDown = (e: React.PointerEvent, action: string) => {
    if (locked) return;
    e.stopPropagation();
    setActiveAction(action);
    startPosRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialTransform: { ...transform }
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeAction || !startPosRef.current || locked) return;
    e.stopPropagation();

    const dx = (e.clientX - startPosRef.current.clientX) / zoom;
    const dy = (e.clientY - startPosRef.current.clientY) / zoom;
    const initial = startPosRef.current.initialTransform;

    if (activeAction === 'move') {
      onTransformChange({
        ...initial,
        x: Math.round(initial.x + dx),
        y: Math.round(initial.y + dy)
      });
    } else if (activeAction === 'rotate') {
      const centerX = width / 2 + initial.x;
      const centerY = height / 2 + initial.y;
      const currentAngle = Math.atan2(e.clientY - (centerY * zoom), e.clientX - (centerX * zoom)) * (180 / Math.PI);
      const startAngle = Math.atan2(startPosRef.current.clientY - (centerY * zoom), startPosRef.current.clientX - (centerX * zoom)) * (180 / Math.PI);
      const angleDiff = currentAngle - startAngle;
      const newRotation = Math.round((initial.rotation + angleDiff) % 360);
      onTransformChange({
        ...initial,
        rotation: newRotation < 0 ? newRotation + 360 : newRotation
      });
    } else if (activeAction.startsWith('scale')) {
      let newScaleX = initial.scaleX;
      let newScaleY = initial.scaleY;
      const factorX = dx / (width / 2);
      const factorY = dy / (height / 2);

      if (activeAction.includes('e')) newScaleX = Math.max(0.1, initial.scaleX + factorX);
      if (activeAction.includes('w')) newScaleX = Math.max(0.1, initial.scaleX - factorX);
      if (activeAction.includes('s')) newScaleY = Math.max(0.1, initial.scaleY + factorY);
      if (activeAction.includes('n')) newScaleY = Math.max(0.1, initial.scaleY - factorY);

      onTransformChange({
        ...initial,
        scaleX: Number(newScaleX.toFixed(3)),
        scaleY: Number(newScaleY.toFixed(3))
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeAction) {
      setActiveAction(null);
      startPosRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  if (locked) return null;

  const handleSize = 8 / zoom;
  const stemHeight = 24 / zoom;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
        transformOrigin: 'center center'
      }}
    >
      {/* Dashed Bounding Box Outline */}
      <div
        className="absolute inset-0 border border-accent-lime/80 shadow-glow-lime pointer-events-auto cursor-move"
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Rotation Stem & Handle */}
      <div
        className="absolute left-1/2 -top-6 -translate-x-1/2 flex flex-col items-center pointer-events-auto cursor-grab active:cursor-grabbing z-40"
        onPointerDown={(e) => handlePointerDown(e, 'rotate')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="w-4 h-4 rounded-full bg-accent-lime border-2 border-surface shadow flex items-center justify-center text-surface hover:scale-125 transition-transform">
          <RotateCw size={10} className="stroke-[3]" />
        </div>
        <div className="w-0.5 h-3 bg-accent-lime/70" />
      </div>

      {/* Corner Resize Handles */}
      {[
        { id: 'scale-nw', cursor: 'nwse-resize', style: { top: -4, left: -4 } },
        { id: 'scale-ne', cursor: 'nesw-resize', style: { top: -4, right: -4 } },
        { id: 'scale-se', cursor: 'nwse-resize', style: { bottom: -4, right: -4 } },
        { id: 'scale-sw', cursor: 'nesw-resize', style: { bottom: -4, left: -4 } },
        { id: 'scale-n', cursor: 'ns-resize', style: { top: -4, left: '50%', transform: 'translateX(-50%)' } },
        { id: 'scale-s', cursor: 'ns-resize', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' } },
        { id: 'scale-w', cursor: 'ew-resize', style: { top: '50%', left: -4, transform: 'translateY(-50%)' } },
        { id: 'scale-e', cursor: 'ew-resize', style: { top: '50%', right: -4, transform: 'translateY(-50%)' } },
      ].map((handle) => (
        <div
          key={handle.id}
          className="absolute w-2.5 h-2.5 bg-surface border border-accent-lime rounded-sm pointer-events-auto shadow-sm hover:scale-150 hover:bg-accent-lime transition-transform"
          style={{ ...handle.style, cursor: handle.cursor }}
          onPointerDown={(e) => handlePointerDown(e, handle.id)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </div>
  );
};
