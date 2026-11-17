/**
 * LayerShift - Settings & Gemini Configuration Modal
 * Allows setting or testing the Gemini API key, choosing vision model,
 * and checking backend health connectivity.
 */

import React, { useState, useEffect } from 'react';
import { api, HealthResponse, ModelItem } from '../services/api';
import {
  X,
  Key,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onKeyUpdated }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('layershift_api_key') || '');
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const storedKey = localStorage.getItem('layershift_api_key');
      if (storedKey) setApiKey(storedKey);

      // Fetch models and health status
      api.checkHealth()
        .then((h) => {
          setHealth(h);
          if (h.selected_model) setSelectedModel(h.selected_model);
        })
        .catch(console.error);

      api.getModels()
        .then((data) => {
          if (data.models) setModels(data.models);
          if (data.active_model) setSelectedModel(data.active_model);
        })
        .catch(console.error);
    }
  }, [isOpen]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testApiKey(apiKey || undefined, selectedModel);
      if (res.success) {
        setTestResult({
          success: true,
          message: res.message || `Gemini API connected successfully to ${res.model || selectedModel}!`
        });
        const h = await api.checkHealth();
        setHealth(h);
      } else {
        setTestResult({
          success: false,
          message: res.message || 'API test failed.'
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Connection failed to Gemini API.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateConfig(apiKey || undefined, selectedModel);
      if (apiKey) {
        localStorage.setItem('layershift_api_key', apiKey);
      }
      setTestResult({
        success: true,
        message: 'Configuration saved! Gemini API key and model persisted to system.'
      });
      const updatedHealth = await api.checkHealth();
      setHealth(updatedHealth);
      if (onKeyUpdated) onKeyUpdated();
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Failed to update settings.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg bg-surface-panel border border-border rounded-2xl shadow-elevated overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent-lime">
              <Zap size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Settings & Gemini Engine</h3>
              <p className="text-[11px] text-text-secondary">AI Vision Models & API Configuration</p>
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
        <div className="p-5 space-y-4 text-xs">
          {/* Health Status Banner */}
          <div className="p-3 bg-surface rounded-xl border border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${health?.status === 'healthy' ? 'bg-accent-lime' : 'bg-accent-amber animate-pulse'}`} />
              <div>
                <span className="font-semibold text-text-primary">Backend Server</span>
                <p className="text-[11px] text-text-muted">
                  {health ? `Status: ${health.status} • Model: ${health.selected_model}` : 'Checking connection...'}
                </p>
              </div>
            </div>
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-2.5 py-1 bg-surface-elevated hover:bg-surface-hover text-text-secondary hover:text-text-primary rounded-lg border border-border flex items-center gap-1.5 text-[11px] transition-colors"
            >
              <RefreshCw size={11} className={isTesting ? 'animate-spin' : ''} />
              Test Connection
            </button>
          </div>

          {/* API Key Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                <Key size={13} className="text-accent-lime" />
                Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-accent-cyan hover:underline flex items-center gap-1"
              >
                Get API Key <ExternalLink size={10} />
              </a>
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={health?.gemini_configured ? '•••••••••••••••••••••••••• (API Key Configured in backend)' : 'Paste your Google AI Studio API Key'}
                className="w-full px-3 py-2 pr-16 bg-surface text-text-primary rounded-xl border border-border focus:border-accent-lime outline-none font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hover:text-text-primary uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-surface-elevated"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[10px] text-text-muted mt-1 flex items-center gap-1">
              <ShieldCheck size={11} className="text-accent-lime" />
              API keys are handled securely by the backend and never exposed in client code.
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5 mb-1.5">
              <Cpu size={13} className="text-accent-cyan" />
              Multimodal Vision Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 bg-surface text-text-primary rounded-xl border border-border focus:border-accent-lime outline-none text-xs"
            >
              <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended — Superior Spatial Reasoning)</option>
              <option value="gemini-3.6-flash">Gemini 3.6 Flash (High Precision Vector Extraction)</option>
              <option value="gemini-flash-latest">Gemini Flash Latest (Stable Multimodal)</option>
              <option value="gemini-pro-latest">Gemini Pro Latest (Complex Intricate Artworks)</option>
            </select>
          </div>

          {/* Feedback Result */}
          {testResult && (
            <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              testResult.success
                ? 'bg-accent-lime/10 border-accent-lime/40 text-accent-lime'
                : 'bg-accent-rose/10 border-accent-rose/40 text-accent-rose'
            }`}>
              {testResult.success ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-surface/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-accent-lime hover:bg-accent-lime-hover text-surface font-semibold text-xs rounded-xl shadow-glow-lime transition-all flex items-center gap-1.5"
          >
            {isSaving && <RefreshCw size={13} className="animate-spin" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
