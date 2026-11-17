/**
 * LayerShift - Master Project State Store & Undo/Redo Engine
 * Powers state management, history timeline, layer manipulations, canvas view, and alerts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Project,
  Layer,
  ImageSource,
  ViewMode,
  ToolMode,
  GenerationSettings,
  GenerationStage,
  ToastNotification,
  LayerTransform
} from '../types';
import { storage } from '../utils/storage';

const MAX_HISTORY_STEPS = 30;

function createDefaultProject(): Project {
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: 'Untitled Vector Project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    image: null,
    layers: [],
    canvasWidth: 800,
    canvasHeight: 800
  };
}

export function useProjectStore() {
  const [project, setProject] = useState<Project>(createDefaultProject);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [toolMode, setToolMode] = useState<ToolMode>('select');

  // Canvas Viewport Controls
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [showCheckerboard, setShowCheckerboard] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(1.0);
  const [splitSliderPos, setSplitSliderPos] = useState<number>(50); // % for split-compare view

  // History Stacks
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // Generation State
  const [prompt, setPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStage, setGenerationStage] = useState<GenerationStage>('idle');
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    layerName: 'Vector Layer',
    layerType: 'outline',
    generationMode: 'precise',
    detailLevel: 'balanced',
    vectorComplexity: 'medium',
    colorPreservation: true
  });

  // User Gemini API Key & Cloud Connectivity State
  const [apiKey, setApiKeyState] = useState<string>(() => {
    return localStorage.getItem('layershift_api_key') || '';
  });
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem('layershift_api_key', key);
    } else {
      localStorage.removeItem('layershift_api_key');
    }
  }, []);

  // Toast System
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addToast = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastNotification = { id, ...toast };
    setToasts((prev) => [...prev, newToast]);

    const duration = toast.duration ?? (toast.type === 'error' ? 8000 : 4000);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Save to history before modifying project state
  const recordHistory = useCallback((currentProject: Project) => {
    setPast((prev) => [...prev.slice(-MAX_HISTORY_STEPS), currentProject]);
    setFuture([]);
    setSaveStatus('unsaved');
  }, []);

  // Undo
  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setFuture((prev) => [project, ...prev]);
    setPast(newPast);
    setProject(previous);
    setSaveStatus('unsaved');
    addToast({ type: 'info', title: 'Undo', message: 'Reverted previous action' });
  }, [past, project, addToast]);

  // Redo
  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);

    setPast((prev) => [...prev, project]);
    setFuture(newFuture);
    setProject(next);
    setSaveStatus('unsaved');
    addToast({ type: 'info', title: 'Redo', message: 'Reapplied action' });
  }, [future, project, addToast]);

  // Set Project Image (or clear it when imgSource is null/undefined)
  const setImage = useCallback((imgSource: ImageSource | null) => {
    if (!imgSource) {
      // Clearing the image restores the normal bright empty editor state.
      // Reset canvas dimensions back to a neutral default so the artboard
      // does not keep the previous image's aspect ratio.
      recordHistory(project);
      setProject((prev) => ({
        ...prev,
        image: null,
        canvasWidth: 800,
        canvasHeight: 800,
        updatedAt: Date.now()
      }));
      setSelectedLayerId(null);
      setZoom(1.0);
      setPanX(0);
      setPanY(0);
      return;
    }

    recordHistory(project);
    setProject((prev) => ({
      ...prev,
      image: imgSource,
      canvasWidth: imgSource.width,
      canvasHeight: imgSource.height,
      updatedAt: Date.now()
    }));
    // Reset pan & zoom to fit newly loaded image nicely
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }, [project, recordHistory]);

  const removeImage = useCallback(() => {
    if (!project.image) return;
    setImage(null);
  }, [setImage]);

  // Add Generated Layer
  const addLayer = useCallback((layerData: Omit<Layer, 'id' | 'createdAt'>) => {
    recordHistory(project);
    const newLayer: Layer = {
      ...layerData,
      id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now()
    };

    setProject((prev) => ({
      ...prev,
      layers: [newLayer, ...prev.layers], // Add to top of stack
      updatedAt: Date.now()
    }));
    setSelectedLayerId(newLayer.id);
    const isLocal = (newLayer.metadata as any)?.engine === 'local_cv';
    addToast({
      type: 'success',
      title: isLocal ? 'Layer Generated (Local CV)' : 'Layer Generated (Gemini Vision)',
      message: isLocal
        ? `Layer "${newLayer.name}" extracted ${newLayer.metadata?.element_count || 0} vector elements from image pixels. (Optional: Add your free Gemini API key in Settings to activate Gemini 2.5 Flash Cloud AI).`
        : `Layer "${newLayer.name}" created with ${newLayer.metadata?.element_count || 0} vector elements via Gemini.`
    });
  }, [project, recordHistory, addToast]);

  // Update Existing Layer
  const updateLayer = useCallback((layerId: string, updates: Partial<Layer>) => {
    setProject((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === layerId);
      if (idx === -1) return prev;
      const updatedLayers = [...prev.layers];
      updatedLayers[idx] = { ...updatedLayers[idx], ...updates };
      return {
        ...prev,
        layers: updatedLayers,
        updatedAt: Date.now()
      };
    });
    setSaveStatus('unsaved');
  }, []);

  // Delete Layer
  const deleteLayer = useCallback((layerId: string) => {
    recordHistory(project);
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== layerId),
      updatedAt: Date.now()
    }));
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
    }
    addToast({ type: 'info', title: 'Layer Deleted', message: 'Vector layer removed' });
  }, [project, recordHistory, selectedLayerId, addToast]);

  // Duplicate Layer
  const duplicateLayer = useCallback((layerId: string) => {
    const target = project.layers.find((l) => l.id === layerId);
    if (!target) return;
    recordHistory(project);

    const dupLayer: Layer = {
      ...target,
      id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `${target.name} Copy`,
      transform: {
        ...target.transform,
        x: target.transform.x + 20,
        y: target.transform.y + 20
      },
      createdAt: Date.now()
    };

    setProject((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === layerId);
      const newLayers = [...prev.layers];
      newLayers.splice(idx, 0, dupLayer);
      return {
        ...prev,
        layers: newLayers,
        updatedAt: Date.now()
      };
    });
    setSelectedLayerId(dupLayer.id);
    addToast({ type: 'success', title: 'Layer Duplicated', message: `Created copy "${dupLayer.name}"` });
  }, [project, recordHistory, addToast]);

  // Toggle Visibility
  const toggleVisibility = useCallback((layerId: string) => {
    const target = project.layers.find((l) => l.id === layerId);
    if (!target) return;
    updateLayer(layerId, { visible: !target.visible });
  }, [project.layers, updateLayer]);

  // Toggle Lock
  const toggleLock = useCallback((layerId: string) => {
    const target = project.layers.find((l) => l.id === layerId);
    if (!target) return;
    updateLayer(layerId, { locked: !target.locked });
  }, [project.layers, updateLayer]);

  // Set Layer Opacity
  const setLayerOpacity = useCallback((layerId: string, opacity: number) => {
    updateLayer(layerId, { opacity: Math.max(0, Math.min(1, opacity)) });
  }, [updateLayer]);

  // Reset Layer Transform
  const resetTransform = useCallback((layerId: string) => {
    recordHistory(project);
    const defaultTransform: LayerTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    updateLayer(layerId, { transform: defaultTransform });
  }, [project, recordHistory, updateLayer]);

  // Reorder Layers
  const moveLayer = useCallback((layerId: string, direction: 'up' | 'down') => {
    const index = project.layers.findIndex((l) => l.id === layerId);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= project.layers.length) return;

    recordHistory(project);
    const newLayers = [...project.layers];
    const [moved] = newLayers.splice(index, 1);
    newLayers.splice(targetIndex, 0, moved);

    setProject((prev) => ({
      ...prev,
      layers: newLayers,
      updatedAt: Date.now()
    }));
  }, [project, recordHistory]);

  // Rename Project
  const renameProject = useCallback((name: string) => {
    setProject((prev) => ({ ...prev, name, updatedAt: Date.now() }));
    setSaveStatus('unsaved');
  }, []);

  // Reset / New Project
  const newProject = useCallback(() => {
    setPast([]);
    setFuture([]);
    const fresh = createDefaultProject();
    setProject(fresh);
    setSelectedLayerId(null);
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
    setSaveStatus('saved');
    storage.saveProject(fresh).catch(console.error);
    addToast({ type: 'info', title: 'New Project', message: 'Started fresh workspace' });
  }, [addToast]);

  // Load Existing Project
  const loadProject = useCallback((loaded: Project) => {
    setPast([]);
    setFuture([]);
    setProject(loaded);
    setSelectedLayerId(loaded.layers?.[0]?.id || null);
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
    setSaveStatus('saved');
    storage.saveProject(loaded).catch(console.error);
    addToast({ type: 'success', title: 'Project Loaded', message: `Opened "${loaded.name}"` });
  }, [addToast]);

  // Autosave to IndexedDB with debounce
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (saveStatus !== 'unsaved') return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await storage.saveProject(project);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Autosave failed:', err);
        setSaveStatus('unsaved');
      }
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [project, saveStatus]);

  // NOTE: On initial launch or refresh, the app deliberately starts with a clean,
  // empty editor (no previously uploaded image and no generated layers). Users must
  // explicitly upload an image or load a curated sample to begin. Restoring the last
  // active project from IndexedDB on startup was removed so refresh never resurrects
  // stale artwork. Saved projects remain available any time via the Recent Projects
  // modal in the navbar.

  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) || null;

  return {
    project,
    selectedLayer,
    selectedLayerId,
    setSelectedLayerId,
    viewMode,
    setViewMode,
    toolMode,
    setToolMode,
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
    past,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    saveStatus,
    setImage,
    removeImage,
    addLayer,
    updateLayer,
    deleteLayer,
    duplicateLayer,
    toggleVisibility,
    toggleLock,
    setLayerOpacity,
    resetTransform,
    moveLayer,
    renameProject,
    newProject,
    loadProject,
    prompt,
    setPrompt,
    isGenerating,
    setIsGenerating,
    generationStage,
    setGenerationStage,
    generationStartTime,
    setGenerationStartTime,
    generationSettings,
    setGenerationSettings,
    apiKey,
    setApiKey,
    geminiConfigured,
    setGeminiConfigured,
    toasts,
    addToast,
    removeToast
  };
}

export type ProjectStore = ReturnType<typeof useProjectStore>;
