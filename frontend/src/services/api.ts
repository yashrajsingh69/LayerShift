/**
 * LayerShift - Frontend API Service Client
 * Handles typed communication with the backend REST endpoints.
 */

import { GenerationSettings, SampleArtwork } from '../types';

export interface HealthResponse {
  status: string;
  service: string;
  gemini_configured: boolean;
  selected_model: string;
  timestamp: number;
}

export interface ModelItem {
  id: string;
  name: string;
  vision: boolean;
  description: string;
}

export interface ModelsResponse {
  active_model: string;
  api_key_configured: boolean;
  models: ModelItem[];
}

export interface GenerateLayerResult {
  success: boolean;
  svg?: string;
  export_svg?: string;
  metadata?: any;
  canvas?: {
    width: number;
    height: number;
    aspect_ratio: number;
  };
  duration_ms?: number;
  timing?: {
    preprocessing_ms?: number;
    vision_analysis_ms?: number;
    vector_synthesis_ms?: number;
    validation_ms?: number;
    total_ms?: number;
  };
  is_repaired?: boolean;
  error?: string;
  status_code?: number;
  retry_delay?: number;
}

export const api = {
  /**
   * Health status check
   */
  async checkHealth(): Promise<HealthResponse> {
    const res = await fetch('/api/health');
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}`);
    }
    return res.json();
  },

  /**
   * Supported models list
   */
  async getModels(): Promise<ModelsResponse> {
    const res = await fetch('/api/models');
    if (!res.ok) {
      throw new Error(`Failed to fetch models (status ${res.status})`);
    }
    return res.json();
  },

  /**
   * Test API Key live against Gemini endpoint
   */
  async testApiKey(apiKey?: string, model?: string): Promise<{ success: boolean; message: string; model?: string }> {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, model: model }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || `Test failed with status ${res.status}`);
    }
    return res.json();
  },

  /**
   * Update or test API Key & model selection
   */
  async updateConfig(apiKey?: string, model?: string): Promise<{ success: boolean; gemini_configured: boolean; selected_model: string; message: string }> {
    const res = await fetch('/api/config-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, model: model }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to update configuration (status ${res.status})`);
    }
    return res.json();
  },

  /**
   * Sample images list for instant 1-click loading
   */
  async getSampleImages(): Promise<SampleArtwork[]> {
    const res = await fetch('/api/sample-images');
    if (!res.ok) {
      throw new Error(`Failed to load sample images`);
    }
    const data = await res.json();
    return data.samples || [];
  },

  /**
   * High-speed (<15ms) Computer Vision Image Structure Analysis
   */
  async analyzeImage(imageFile: File | Blob): Promise<any> {
    const formData = new FormData();
    formData.append('image', imageFile);
    const res = await fetch('/api/analyze-image', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Image analysis failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.analysis;
  },

  /**
   * Generate an editable vector layer from image
   */
  async generateLayer(
    imageFile: File,
    prompt: string,
    settings: GenerationSettings
  ): Promise<GenerateLayerResult> {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('prompt', prompt);
    formData.append('settings', JSON.stringify(settings));

    try {
      const res = await fetch('/api/generate-layer', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error || `Server returned error status ${res.status}`,
          status_code: res.status,
          retry_delay: data.retry_delay
        };
      }

      return {
        success: true,
        svg: data.svg,
        export_svg: data.export_svg,
        metadata: data.metadata,
        canvas: data.canvas,
        duration_ms: data.duration_ms,
        is_repaired: data.is_repaired
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network connection to backend server failed. Is the backend running on port 5000?',
        status_code: 0
      };
    }
  },

  /**
   * Request repair for an invalid or incomplete SVG
   */
  async repairSvg(
    brokenSvg: string,
    prompt: string,
    width: number,
    height: number,
    errorDetails?: string
  ): Promise<{ success: boolean; svg?: string; metadata?: any; error?: string }> {
    try {
      const res = await fetch('/api/repair-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          svg: brokenSvg,
          prompt,
          width,
          height,
          error_details: errorDetails
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || `Repair failed with status ${res.status}` };
      }
      return { success: true, svg: data.svg, metadata: data.metadata };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network connection failed during SVG repair.' };
    }
  }
};
