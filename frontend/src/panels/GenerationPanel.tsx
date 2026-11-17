/**
 * LayerShift - Left Sidebar: AI Layer Generator & Universal Studio Controls
 * Provides universal computer vision image analysis, categorized prompt library (10 categories),
 * smart generation modes (Quick, Precise, Advanced), and live telemetry.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProjectStore } from '../stores/useProjectStore';
import { api } from '../services/api';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Layers,
  Wand2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Key,
  ShieldCheck,
  ExternalLink,
  Zap,
  Target,
  Sliders,
  Eye,
  EyeOff,
  Car,
  Building,
  User,
  Smile,
  Mountain,
  Award,
  Smartphone,
  PenTool,
  Scissors,
  Palette,
  Info
} from 'lucide-react';
import { GenerationSettings, LayerType } from '../types';

interface GenerationPanelProps {
  store: ProjectStore;
  onOpenSampleModal?: () => void;
  onOpenSettingsModal?: () => void;
}

// 10 Comprehensive Universal Prompt Categories
const PROMPT_CATEGORIES = [
  {
    id: "vehicles",
    name: "Vehicles",
    icon: Car,
    prompts: [
      { label: "Wheels & Tires", prompt: "Extract the wheels and tires into a separate editable vector layer." },
      { label: "Car Body Outline", prompt: "Create a clean electric lime outline of the car body silhouette." },
      { label: "Windows & Windshield", prompt: "Extract the windshield and window frames into a vector layer." }
    ]
  },
  {
    id: "architecture",
    name: "Architecture",
    icon: Building,
    prompts: [
      { label: "Gable Roofline", prompt: "Extract the gable roofline and structural facade into a vector layer." },
      { label: "Windows & Doors", prompt: "Extract the window frames and front entrance door into clean paths." },
      { label: "Full Building Trace", prompt: "Create a clean line-art trace of the entire building structure." }
    ]
  },
  {
    id: "portraits",
    name: "Portraits",
    icon: User,
    prompts: [
      { label: "Hair Volume", prompt: "Extract hair into a separate vector layer with rich violet stroke." },
      { label: "Eyes & Glasses", prompt: "Create a clean vector layer containing only the eyes and glasses." },
      { label: "Facial & Jawline", prompt: "Trace the facial contours, jawline, and collar into clean strokes." }
    ]
  },
  {
    id: "cartoons",
    name: "Cartoons & Mascots",
    icon: Smile,
    prompts: [
      { label: "Mascot Outline", prompt: "Extract the character outline as a separate vector layer with cyan stroke." },
      { label: "Face & Whiskers", prompt: "Create a separate vector layer containing only the character's facial features." },
      { label: "Collar & Accents", prompt: "Extract the character's collar, bell, and pocket into an editable layer." }
    ]
  },
  {
    id: "landscapes",
    name: "Landscapes",
    icon: Mountain,
    prompts: [
      { label: "Mountain Ridges", prompt: "Extract the mountain ridges and horizon line into a vector layer." },
      { label: "Rising Sun Halo", prompt: "Extract the rising sun into a clean circular vector accent." },
      { label: "Trees & Water", prompt: "Trace the foreground pine trees and lake reflection into an organic layer." }
    ]
  },
  {
    id: "logos",
    name: "Logos & Emblems",
    icon: Award,
    prompts: [
      { label: "Shield Boundary", prompt: "Trace the outer shield boundary into a clean gold vector contour." },
      { label: "Center Star / Icon", prompt: "Extract the center star and inner symbol into an editable vector layer." },
      { label: "Complete Vector Logo", prompt: "Convert the complete emblem into crisp vector shapes." }
    ]
  },
  {
    id: "products",
    name: "Product Design",
    icon: Smartphone,
    prompts: [
      { label: "Optical Lens Rings", prompt: "Trace concentric optical lens rings and dials into clean circular paths." },
      { label: "Device Chassis", prompt: "Extract the product chassis and structural boundary with electric lime stroke." },
      { label: "Technical Line Art", prompt: "Convert the product sketch into precision technical line art." }
    ]
  },
  {
    id: "lineart",
    name: "Line Art & Inking",
    icon: PenTool,
    prompts: [
      { label: "Hand-Drawn to Vector", prompt: "Convert this hand-drawn sketch to crisp high-precision vector line art." },
      { label: "Clean Ink Contours", prompt: "Extract clean inking contour lines with varied stroke weights." },
      { label: "Full Contour Inking", prompt: "Vectorize the entire sketch contour network into an ink layer." }
    ]
  },
  {
    id: "objects",
    name: "Object Extraction",
    icon: Scissors,
    prompts: [
      { label: "Foreground Subject", prompt: "Extract the main foreground object with transparent background." },
      { label: "Outer Silhouette", prompt: "Create a clean electric lime outline of the complete silhouette." },
      { label: "Isolate Focal Element", prompt: "Extract the focal subject and remove background noise." }
    ]
  },
  {
    id: "creative",
    name: "Creative & Stylized",
    icon: Palette,
    prompts: [
      { label: "Neon Lime Accent", prompt: "Add an electric lime neon stroke along outer contours." },
      { label: "Warm Coral Glow", prompt: "Create a glowing warm coral vector accent around the subject." },
      { label: "Gold Body Outline", prompt: "Add a clean gold outline around only the outer body silhouette. Do not modify facial features." }
    ]
  }
];

const PRESET_COLORS = [
  { name: "Electric Lime", hex: "#C7FF4A" },
  { name: "Rich Violet", hex: "#7C3AED" },
  { name: "Warm Coral", hex: "#FF6B6B" },
  { name: "Soft Champagne", hex: "#F5E6D3" },
  { name: "Gold", hex: "#FFD700" },
  { name: "Cyan", hex: "#62D9E8" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Black", hex: "#000000" }
];

export const GenerationPanel: React.FC<GenerationPanelProps> = ({
  store,
  onOpenSampleModal,
  onOpenSettingsModal
}) => {
  const {
    project,
    prompt,
    setPrompt,
    isGenerating,
    setIsGenerating,
    generationSettings,
    setGenerationSettings,
    addLayer,
    setImage,
    removeImage,
    addToast,
    apiKey,
    setApiKey
  } = store;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPromptCategory, setSelectedPromptCategory] = useState<string>("vehicles");
  const [strokeColor, setStrokeColor] = useState<string>("#C7FF4A");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showKeyCard, setShowKeyCard] = useState(false);
  const [showKeyText, setShowKeyText] = useState(false);
  const [inputKey, setInputKey] = useState(apiKey);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);

  // Live Computer Vision Image Analysis HUD State
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState<any>(null);

  // Automatically trigger CV Analysis whenever a new image is loaded
  useEffect(() => {
    if (project.image?.fileObject) {
      setIsAnalyzingImage(true);
      api.analyzeImage(project.image.fileObject)
        .then((res) => {
          setImageAnalysis(res);
        })
        .catch((err) => {
          console.warn("CV analysis error:", err);
        })
        .finally(() => setIsAnalyzingImage(false));
    } else {
      setImageAnalysis(null);
    }
  }, [project.image]);

  const handleTestAndSaveKey = async () => {
    if (!inputKey.trim()) {
      setApiKey('');
      setKeyStatus('Key removed. Using local CV engine.');
      return;
    }
    setIsTestingKey(true);
    setKeyStatus('Testing connection...');
    try {
      const res = await api.testApiKey(inputKey.trim());
      if (res.success) {
        setApiKey(inputKey.trim());
        await api.updateConfig(inputKey.trim());
        setKeyStatus(`Connected: ${res.model || 'Gemini 2.5'}`);
        addToast({ type: 'success', title: 'API Key Verified', message: 'Gemini Vision AI is active.' });
      } else {
        setKeyStatus(res.message || 'Key invalid');
      }
    } catch (err: any) {
      setKeyStatus(err.message || 'Connection failed');
      addToast({ type: 'warning', title: 'Key Check', message: 'Offline/Local CV engine remains fully available.' });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Image Upload Handlers
  const handleFile = (file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      addToast({ type: 'error', title: 'Invalid File', message: 'Please upload a PNG, JPEG, or WebP image.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImage({
          filename: file.name,
          previewUrl: dataUrl,
          base64Data: dataUrl,
          width: img.naturalWidth || 800,
          height: img.naturalHeight || 800,
          aspectRatio: (img.naturalWidth || 800) / (img.naturalHeight || 800),
          mimeType: file.type,
          fileObject: file
        });
        addToast({ type: 'success', title: 'Image Uploaded', message: `Loaded ${file.name} (${img.naturalWidth}x${img.naturalHeight})` });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Generation Trigger
  const handleGenerate = async () => {
    if (!project.image?.fileObject) {
      addToast({ type: 'error', title: 'Missing Artwork', message: 'Please upload an image or load a sample sketch first.' });
      return;
    }
    if (!prompt.trim()) {
      addToast({ type: 'warning', title: 'Empty Prompt', message: 'Please describe what vector layer you want to generate.' });
      return;
    }

    setIsGenerating(true);
    const t0 = Date.now();

    try {
      const fullPrompt = strokeColor !== "#C7FF4A" ? `${prompt.trim()} using stroke color ${strokeColor}` : prompt.trim();
      const res = await api.generateLayer(project.image.fileObject, fullPrompt, {
        ...generationSettings,
        layerName: generationSettings.layerName || 'Vector Layer'
      });

      if (res.success && res.svg) {
        const elapsed = Date.now() - t0;
        const layerMeta = res.metadata || {};
        const layerName = layerMeta.layer_name || generationSettings.layerName || 'Generated Vector Layer';

        addLayer({
          name: layerName,
          type: generationSettings.layerType,
          svgContent: res.svg,
          exportSvg: res.export_svg || res.svg,
          visible: true,
          locked: false,
          opacity: 1.0,
          transform: { x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, rotation: 0 },
          blendMode: 'normal',
          metadata: {
            ...layerMeta,
            generation_duration_ms: elapsed,
            timing: res.timing
          }
        });

        addToast({
          type: 'success',
          title: 'Vector Layer Generated',
          message: `Created "${layerName}" in ${elapsed}ms (${layerMeta.engine || 'local_cv'})`
        });
      } else {
        addToast({ type: 'error', title: 'Generation Failed', message: res.error || 'Unable to synthesize vector layer.' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Generation Error', message: err.message || 'An unexpected error occurred.' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Keyboard shortcut Ctrl+Enter to generate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!isGenerating && project.image && prompt.trim()) {
          e.preventDefault();
          handleGenerate();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGenerating, project.image, prompt, handleGenerate]);

  const activeCategory = useMemo(() => {
    return PROMPT_CATEGORIES.find((c) => c.id === selectedPromptCategory) || PROMPT_CATEGORIES[0];
  }, [selectedPromptCategory]);

  return (
    <aside className="w-[340px] min-w-[340px] max-w-[340px] h-full bg-[#160F1C] border-r border-[#32233B] flex flex-col select-none overflow-hidden shrink-0 z-10 shadow-panel">
      {/* Panel Header */}
      <div className="h-12 px-4 border-b border-[#32233B] flex items-center justify-between bg-[#1B1222]">
        <div className="flex items-center gap-2">
          <Wand2 size={15} className="text-accent-lime" />
          <span className="text-xs font-semibold text-text-primary tracking-wide">AI Layer Studio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSampleModal}
            className="px-2 py-1 bg-[#281A33] hover:bg-[#382447] text-accent-lime hover:text-white border border-[#442C56] rounded-md text-[10px] font-medium transition-all flex items-center gap-1"
            title="Open Universal Sample Sketches"
          >
            <Sparkles size={11} />
            <span>Samples</span>
          </button>
          <button
            type="button"
            onClick={() => setShowKeyCard(!showKeyCard)}
            className={`p-1.5 rounded-md text-[11px] border transition-all ${
              apiKey ? 'bg-[#281A33] text-accent-lime border-accent-lime/40' : 'bg-[#1E1426] text-text-muted border-[#32233B] hover:text-text-secondary'
            }`}
            title="Gemini AI Key Integration"
          >
            <Key size={13} />
          </button>
        </div>
      </div>

      {/* Scrollable Configuration Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* API Key Drawer */}
        {showKeyCard && (
          <div className="p-3 bg-[#1F1428] border border-[#442C56] rounded-xl space-y-2.5 shadow-panel">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-primary flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-accent-lime" /> Gemini Vision AI
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-accent-cyan hover:underline flex items-center gap-0.5"
              >
                <span>Get Key</span>
                <ExternalLink size={9} />
              </a>
            </div>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showKeyText ? 'text' : 'password'}
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="Paste AIzaSy... key"
                  className="w-full bg-[#140C1A] border border-[#3A244A] rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-lime pr-7"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyText(!showKeyText)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {showKeyText ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleTestAndSaveKey}
                disabled={isTestingKey}
                className="px-2.5 py-1.5 bg-accent-lime text-black rounded-lg text-xs font-semibold hover:bg-accent-lime/90 disabled:opacity-50 transition-all shrink-0"
              >
                {isTestingKey ? <RefreshCw size={12} className="animate-spin" /> : 'Save'}
              </button>
            </div>
            {keyStatus && (
              <p className="text-[10px] font-mono text-accent-lime/90 leading-tight truncate">{keyStatus}</p>
            )}
          </div>
        )}

        {/* 1. Artwork Upload Slot */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
            1. Source Artwork
          </label>
          {project.image ? (
            <div className="p-2.5 bg-[#1C1224] border border-[#3A244A] rounded-xl flex items-center gap-3 relative group">
              <img
                src={project.image.previewUrl}
                alt="Source preview"
                className="w-14 h-14 object-cover rounded-lg bg-black border border-[#442C56] shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{project.image.filename}</p>
                <p className="text-[10px] font-mono text-text-muted">
                  {project.image.width} × {project.image.height} px
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-accent-cyan hover:underline mt-0.5 block"
                >
                  Replace image
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeImage()}
                className="p-1 rounded-md text-text-muted hover:text-rose-400 hover:bg-[#281636] transition-colors"
                title="Remove image"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2 ${
                isDragging
                  ? 'border-accent-lime bg-accent-lime/10'
                  : 'border-[#3A244A] bg-[#1B1123] hover:border-accent-lime/50 hover:bg-[#20142A]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#281835] flex items-center justify-center text-accent-lime">
                <Upload size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-text-primary">Upload Sketch or Image</p>
                <p className="text-[10px] text-text-muted mt-0.5">PNG, JPG, WebP up to 10MB</p>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
            }}
          />
        </div>

        {/* 2. Intelligent Computer Vision Understanding HUD */}
        {project.image && (
          <div className="p-3 bg-[#1A1121] border border-[#352243] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-accent-cyan uppercase tracking-wider flex items-center gap-1">
                <Info size={11} /> Image Understanding HUD
              </span>
              {isAnalyzingImage && <RefreshCw size={10} className="animate-spin text-accent-cyan" />}
            </div>

            {imageAnalysis ? (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Detected Subject:</span>
                  <span className="font-semibold text-accent-lime uppercase tracking-wide">
                    {imageAnalysis.inferred_category || 'Universal Subject'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Visual Complexity:</span>
                  <span className="font-mono text-text-secondary">
                    {imageAnalysis.valid_contours_count || 1} contours
                  </span>
                </div>
                {/* Dominant Palette Swatches */}
                {imageAnalysis.dominant_palette && imageAnalysis.dominant_palette.length > 0 && (
                  <div className="pt-1.5 border-t border-[#352243]/60 flex items-center justify-between">
                    <span className="text-[10px] text-text-muted">Artwork Palette:</span>
                    <div className="flex items-center gap-1">
                      {imageAnalysis.dominant_palette.map((hex: string, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setStrokeColor(hex)}
                          className="w-4 h-4 rounded-full border border-black/60 shadow-sm transition-transform hover:scale-125"
                          style={{ backgroundColor: hex }}
                          title={`Sample ${hex} as stroke color`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-text-muted">Analyzing image geometry and spatial contours...</p>
            )}
          </div>
        )}

        {/* 3. Prompt Editor */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
              2. Editing Instruction
            </label>
            <span className="text-[10px] font-mono text-text-muted">{prompt.length} / 500</span>
          </div>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the editable vector layer to extract... e.g. 'Extract the car wheels into a separate layer'"
              rows={3}
              maxLength={500}
              className="w-full bg-[#180E1F] border border-[#3A244A] focus:border-accent-lime focus:ring-1 focus:ring-accent-lime rounded-xl p-3 text-xs text-text-primary placeholder:text-text-muted/60 resize-none outline-none leading-relaxed"
            />
            {prompt && (
              <button
                type="button"
                onClick={() => setPrompt('')}
                className="absolute right-2.5 bottom-2.5 text-text-muted hover:text-text-primary text-[10px] bg-[#22132D] px-1.5 py-0.5 rounded border border-[#442858]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* 4. Categorized Universal Prompt Library */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
              3. Universal Prompt Library
            </label>
            <span className="text-[10px] text-text-muted">10 Categories</span>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-1">
            {PROMPT_CATEGORIES.map((cat) => {
              const IconComp = cat.icon;
              const isActive = cat.id === selectedPromptCategory;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedPromptCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium shrink-0 flex items-center gap-1 transition-all ${
                    isActive
                      ? 'bg-accent-lime text-black font-semibold shadow-glow-lime'
                      : 'bg-[#1C1124] text-text-secondary hover:text-white hover:bg-[#251731] border border-[#322040]'
                  }`}
                >
                  <IconComp size={11} />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          {/* Prompt Chips */}
          <div className="space-y-1">
            {activeCategory.prompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(p.prompt)}
                className="w-full text-left p-2 rounded-lg bg-[#190F20] hover:bg-[#24152F] border border-[#322040] hover:border-accent-lime/50 text-[11px] text-text-secondary hover:text-text-primary transition-all flex items-center justify-between group"
              >
                <span className="truncate pr-2 font-medium">{p.label}</span>
                <span className="text-[9px] font-mono text-accent-lime shrink-0 opacity-70 group-hover:opacity-100">
                  Insert
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. Generation Modes (Quick / Precise / Advanced) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
            4. Generation Mode
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'quick', label: 'Quick', sub: '< 30ms', icon: Zap },
              { id: 'precise', label: 'Precise', sub: 'Default', icon: Target },
              { id: 'advanced', label: 'Advanced', sub: 'Multi-layer', icon: Layers }
            ].map((m) => {
              const Icon = m.icon;
              const active = generationSettings.generationMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setGenerationSettings({ ...generationSettings, generationMode: m.id as any })}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                    active
                      ? 'bg-accent-lime/15 border-accent-lime text-text-primary shadow-sm'
                      : 'bg-[#1A1022] border-[#322040] text-text-muted hover:border-[#4A2F5E] hover:text-text-secondary'
                  }`}
                >
                  <Icon size={14} className={active ? 'text-accent-lime' : 'text-text-muted'} />
                  <span className="text-xs font-semibold mt-1">{m.label}</span>
                  <span className="text-[9px] font-mono opacity-80">{m.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Vector Styling: Color & Stroke Width */}
        <div className="space-y-2 p-3 bg-[#1B1123] border border-[#352243] rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
              Vector Stroke Color
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-full border border-black shadow-sm"
                style={{ backgroundColor: strokeColor }}
              />
              <span className="text-[10px] font-mono text-text-primary">{strokeColor}</span>
            </div>
          </div>
          {/* Preset Swatches */}
          <div className="flex items-center justify-between gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setStrokeColor(c.hex)}
                className={`w-6 h-6 rounded-lg border transition-transform ${
                  strokeColor === c.hex ? 'border-white scale-110 shadow-glow-lime' : 'border-black/50 hover:scale-105'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer CTA Button */}
      <div className="p-4 border-t border-[#32233B] bg-[#1A1121] shrink-0">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !project.image}
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-glow-lime transition-all ${
            isGenerating || !project.image
              ? 'bg-[#2D1F38] text-text-muted cursor-not-allowed border border-[#3E2A4D]'
              : 'bg-accent-lime text-black hover:bg-accent-lime/90 active:scale-[0.99]'
          }`}
        >
          {isGenerating ? (
            <>
              <RefreshCw size={15} className="animate-spin text-black" />
              <span>Synthesizing Vector Layer...</span>
            </>
          ) : (
            <>
              <Sparkles size={15} />
              <span>Generate Vector Layer</span>
              <span className="text-[10px] opacity-70 font-mono ml-1">(Ctrl+Enter)</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
