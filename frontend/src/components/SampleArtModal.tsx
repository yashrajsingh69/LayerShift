/**
 * LayerShift - Curated Sample Artworks Modal
 * Enables instant 1-click loading across 8 universal categories:
 * Animals, Characters, Portraits, Vehicles, Architecture, Products, Logos, Landscapes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { SampleArtwork } from '../types';
import {
  X,
  Sparkles,
  ArrowRight,
  Target,
  Filter
} from 'lucide-react';

interface SampleArtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSample: (sample: SampleArtwork, customPrompt?: string) => void;
}

export const SampleArtModal: React.FC<SampleArtModalProps> = ({
  isOpen,
  onClose,
  onSelectSample
}) => {
  const [samples, setSamples] = useState<SampleArtwork[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.getSampleImages()
        .then(setSamples)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    samples.forEach((s) => set.add(s.category));
    return ['All', ...Array.from(set)];
  }, [samples]);

  const filteredSamples = useMemo(() => {
    if (selectedCategory === 'All') return samples;
    return samples.filter((s) => s.category === selectedCategory);
  }, [samples, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
      <div className="w-full max-w-5xl bg-[#17111D] border border-[#3A2945] rounded-2xl shadow-elevated overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-[#1E1526] border-b border-[#3A2945] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2B1D37] border border-[#523B63] flex items-center justify-center text-accent-lime shadow-glow-lime">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">Curated Universal Sample Artworks</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-accent-lime/15 text-accent-lime border border-accent-lime/30">
                  8 Categories
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">Instant 1-Click Creative Testing Across Multiple Subjects</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-[#2B1D37] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="px-5 py-2.5 bg-[#140E19] border-b border-[#2C1F35] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <Filter size={12} className="text-text-muted mr-1 shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium shrink-0 transition-all ${
                selectedCategory === cat
                  ? 'bg-accent-lime text-black font-semibold shadow-glow-lime'
                  : 'bg-[#22162B] text-text-secondary hover:text-text-primary hover:bg-[#2C1D38] border border-[#3A2945]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            <p className="col-span-2 text-xs text-text-muted text-center py-16">Loading universal sample artworks...</p>
          ) : (
            filteredSamples.map((sample) => (
              <div
                key={sample.id}
                className="p-4 bg-[#1F1528] hover:bg-[#281B34] border border-[#382643] hover:border-accent-lime/60 rounded-xl flex flex-col transition-all group shadow-panel"
              >
                <div className="flex gap-4">
                  {/* Visual Preview */}
                  <div className="w-36 h-36 shrink-0 rounded-lg overflow-hidden bg-[#100B15] border border-[#382643] flex items-center justify-center relative">
                    {sample.url ? (
                      <img
                        src={sample.url}
                        alt={sample.name}
                        className="w-full h-full object-contain p-1"
                      />
                    ) : sample.svg_data ? (
                      <div
                        className="w-full h-full p-1.5 [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: sample.svg_data }}
                      />
                    ) : (
                      <span className="text-[10px] text-text-muted">Preview</span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-accent-cyan uppercase tracking-wider block mb-1">
                        {sample.category}
                      </span>
                      <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent-lime transition-colors">
                        {sample.name}
                      </h4>
                      <p className="text-[11px] text-text-muted line-clamp-2 mt-1 leading-snug">
                        "{sample.suggested_prompt}"
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectSample(sample);
                        onClose();
                      }}
                      className="mt-3 py-1.5 px-3 bg-accent-lime text-black rounded-lg text-xs font-semibold hover:bg-accent-lime/90 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>Load Artwork</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Preconfigured Test Prompts */}
                {sample.test_prompts && sample.test_prompts.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#382643]/70">
                    <p className="text-[10px] text-accent-lime font-medium mb-1.5 flex items-center gap-1">
                      <Target size={11} /> 1-Click Test Prompts:
                    </p>
                    <div className="grid grid-cols-1 gap-1">
                      {sample.test_prompts.map((tp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            onSelectSample(sample, tp);
                            onClose();
                          }}
                          className="px-2.5 py-1 text-left bg-[#170E1E] hover:bg-accent-lime/10 hover:border-accent-lime/60 border border-[#382643] rounded-md text-[10px] text-text-secondary hover:text-text-primary transition-colors flex items-center justify-between"
                        >
                          <span className="truncate mr-2">{tp}</span>
                          <span className="text-[9px] font-mono text-accent-lime shrink-0">TEST {idx + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
