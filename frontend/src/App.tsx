/**
 * LayerShift - Master Creative Editing Application
 * "Generate Editable Layers, Not Flat Pixels."
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from './stores/useProjectStore';
import { Navbar } from './components/Navbar';
import { BottomToolbar } from './components/BottomToolbar';
import { GenerationPanel } from './panels/GenerationPanel';
import { LayersInspector } from './panels/LayersInspector';
import { CreativeCanvas } from './canvas/CreativeCanvas';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { RecentProjectsModal } from './components/RecentProjectsModal';
import { SampleArtModal } from './components/SampleArtModal';
import { ToastContainer } from './components/ToastContainer';
import { SampleArtwork } from './types';

export default function App() {
  const store = useProjectStore();
  const {
    selectedLayerId,
    deleteLayer,
    undo,
    redo,
    canUndo,
    canRedo,
    zoom,
    setZoom,
    setPanX,
    setPanY,
    setToolMode,
    setSelectedLayerId,
    setImage,
    toasts,
    removeToast,
    addToast,
    loadProject
  } = store;

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isRecentOpen, setIsRecentOpen] = useState(false);
  const [isSamplesOpen, setIsSamplesOpen] = useState(false);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if active element is an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canUndo) undo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canRedo) redo();
      }

      // Delete selected layer
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) {
          e.preventDefault();
          deleteLayer(selectedLayerId);
        }
      }

      // Zoom + / -
      else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((prev) => Math.min(6.0, Number((prev + 0.1).toFixed(2))));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((prev) => Math.max(0.15, Number((prev - 0.1).toFixed(2))));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
        setPanX(0);
        setPanY(0);
      }

      // Tool Switching
      else if (e.key.toLowerCase() === 'v') {
        setToolMode('select');
      } else if (e.key.toLowerCase() === 'h') {
        setToolMode('pan');
      } else if (e.key.toLowerCase() === 'z') {
        setToolMode('zoom');
      }

      // Escape
      else if (e.key === 'Escape') {
        setSelectedLayerId(null);
        setIsSettingsOpen(false);
        setIsShortcutsOpen(false);
        setIsRecentOpen(false);
        setIsSamplesOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canUndo,
    canRedo,
    undo,
    redo,
    selectedLayerId,
    deleteLayer,
    setZoom,
    setPanX,
    setPanY,
    setToolMode,
    setSelectedLayerId
  ]);

  // Handle Loading a Curated Sample Artwork
  const handleSelectSample = (sample: SampleArtwork, customPrompt?: string) => {
    const width = sample.width || 800;
    const height = sample.height || 800;
    const activePrompt = customPrompt || sample.suggested_prompt;

    if (activePrompt) {
      store.setPrompt(activePrompt);
    }

    if (sample.url) {
      fetch(sample.url)
        .then((res) => res.blob())
        .then((blob) => {
          const pngUrl = URL.createObjectURL(blob);
          const reader = new FileReader();
          reader.onload = () => {
            const base64Data = reader.result as string;
            const fileObj = new File([blob], sample.filename || `${sample.id}.png`, { type: 'image/png' });

            setImage({
              filename: `${sample.name}.png`,
              previewUrl: pngUrl,
              base64Data,
              width,
              height,
              aspectRatio: width / height,
              mimeType: 'image/png',
              fileObject: fileObj
            });

            addToast({
              type: 'success',
              title: 'Sample Artwork Loaded',
              message: `Loaded "${sample.name}". Prompt ready in generation panel.`
            });
          };
          reader.readAsDataURL(blob);
        })
        .catch((err) => {
          console.error("Failed to load sample image file:", err);
        });
      return;
    }

    // Fallback: Render SVG into an HTML5 Canvas to produce a high-res PNG image
    if (sample.svg_data) {
      const img = new Image();
      const svgBlob = new Blob([sample.svg_data], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = width;
        offCanvas.height = height;
        const ctx = offCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          offCanvas.toBlob((pngBlob) => {
            if (!pngBlob) return;
            const pngUrl = URL.createObjectURL(pngBlob);
            const reader = new FileReader();
            reader.onload = () => {
              const base64Data = reader.result as string;
              const fileObj = new File([pngBlob], `${sample.id}.png`, { type: 'image/png' });

              setImage({
                filename: `${sample.name}.png`,
                previewUrl: pngUrl,
                base64Data,
                width,
                height,
                aspectRatio: width / height,
                mimeType: 'image/png',
                fileObject: fileObj
              });

              addToast({
                type: 'success',
                title: 'Sample Artwork Loaded',
                message: `Loaded "${sample.name}". Prompt ready in generation panel.`
              });
            };
            reader.readAsDataURL(pngBlob);
          }, 'image/png');
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-text-primary">
      {/* 1. Top Navigation Bar */}
      <Navbar
        store={store}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenRecentProjects={() => setIsRecentOpen(true)}
        onOpenSamples={() => setIsSamplesOpen(true)}
      />

      {/* 2. Main Workspace Layout: Left Sidebar + Center Canvas + Right Sidebar */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left: AI Generation Sidebar */}
        <GenerationPanel
          store={store}
          onOpenSampleModal={() => setIsSamplesOpen(true)}
        />

        {/* Center: High-Performance Creative Canvas */}
        <CreativeCanvas
          store={store}
          onOpenSampleModal={() => setIsSamplesOpen(true)}
        />

        {/* Right: Layers Inspector Sidebar */}
        <LayersInspector store={store} />
      </main>

      {/* 3. Bottom Workspace Toolbar */}
      <BottomToolbar store={store} />

      {/* 4. Modals & Dialogs */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <RecentProjectsModal
        isOpen={isRecentOpen}
        onClose={() => setIsRecentOpen(false)}
        onSelectProject={(proj) => loadProject(proj)}
      />

      <SampleArtModal
        isOpen={isSamplesOpen}
        onClose={() => setIsSamplesOpen(false)}
        onSelectSample={handleSelectSample}
      />

      {/* 5. Floating Toast Notification System */}
      <ToastContainer
        toasts={toasts}
        onDismiss={removeToast}
      />
    </div>
  );
}
