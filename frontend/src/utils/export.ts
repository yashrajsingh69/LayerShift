/**
 * LayerShift - Export Engine
 * Handles Standalone SVG download, JSZip layer bundling, PNG composite rendering, and Project JSON export/import.
 */

import JSZip from 'jszip';
import { Project, Layer } from '../types';

/**
 * Trigger browser file download from Blob or string
 */
export function downloadFile(content: Blob | string, filename: string, mimeType: string = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export a single layer as standalone SVG file
 */
export function exportSingleLayerSVG(layer: Layer, projectName: string = 'layershift') {
  const content = layer.exportSvg || layer.svgContent;
  const safeLayerName = layer.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const filename = `${projectName}_${safeLayerName}.svg`;
  downloadFile(content, filename, 'image/svg+xml;charset=utf-8');
}

/**
 * Export all layers as a ZIP archive containing individual SVG files
 */
export async function exportAllLayersZip(layers: Layer[], projectName: string = 'layershift'): Promise<void> {
  const zip = new JSZip();
  const folderName = `${projectName}_vector_layers`;
  const folder = zip.folder(folderName);

  layers.forEach((layer, index) => {
    const padIndex = String(index + 1).padStart(2, '0');
    const safeName = layer.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filename = `${padIndex}_${safeName}.svg`;
    const content = layer.exportSvg || layer.svgContent;
    folder?.file(filename, content);
  });

  // Add a manifest README
  const readmeContent = `# LayerShift - Vector Layers Archive
Project: ${projectName}
Exported Layers: ${layers.length}
Date: ${new Date().toISOString()}

Layers included:
${layers.map((l, i) => `${i + 1}. ${l.name} (${l.type}) - Complexity: ${l.metadata?.complexity_score || 'N/A'}`).join('\n')}

Generated with LayerShift: Generate Editable Layers, Not Flat Pixels.
`;
  folder?.file('README.txt', readmeContent);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadFile(zipBlob, `${projectName}_layers.zip`, 'application/zip');
}

/**
 * Render the entire canvas composition (original image + visible SVG layers) into PNG
 */
export async function exportCompositionPNG(
  project: Project,
  includeOriginalImage: boolean = true
): Promise<void> {
  const width = project.canvasWidth || 800;
  const height = project.canvasHeight || 800;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize 2D canvas context for PNG export');

  // Clear with transparent or black background
  ctx.clearRect(0, 0, width, height);

  // 1. Draw original image if enabled and present
  if (includeOriginalImage && project.image) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        resolve();
      };
      img.onerror = () => {
        // Continue even if original image fails
        resolve();
      };
      img.src = project.image?.base64Data || project.image?.previewUrl || '';
    });
  }

  // 2. Draw each visible layer in bottom-to-top order
  for (const layer of project.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity;

    // Apply layer blend mode if supported
    if (layer.blendMode && layer.blendMode !== 'normal') {
      ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    }

    // Apply transform (translation, rotation, scale)
    const { x, y, scaleX, scaleY, rotation } = layer.transform;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.translate(centerX + x, centerY + y);
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);

    // Render SVG onto canvas
    await new Promise<void>((resolve) => {
      const svgBlob = new Blob([layer.svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const svgImg = new Image();
      svgImg.onload = () => {
        ctx.drawImage(svgImg, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve();
      };
      svgImg.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      svgImg.src = url;
    });

    ctx.restore();
  }

  // Export canvas to PNG Blob
  canvas.toBlob((blob) => {
    if (blob) {
      const safeProjectName = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      downloadFile(blob, `${safeProjectName}_composite.png`, 'image/png');
    }
  }, 'image/png');
}

/**
 * Export entire project as a reusable .layershift JSON file
 */
export function exportProjectJSON(project: Project): void {
  const safeProjectName = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const cleanProject = {
    ...project,
    updatedAt: Date.now(),
    appVersion: '1.0.0',
    layershift_schema: '1.0'
  };
  const jsonStr = JSON.stringify(cleanProject, null, 2);
  downloadFile(jsonStr, `${safeProjectName}.layershift`, 'application/json');
}

/**
 * Import project from JSON file string
 */
export function importProjectJSON(jsonString: string): Project {
  const data = JSON.parse(jsonString);
  if (!data.id || !Array.isArray(data.layers)) {
    throw new Error('Invalid LayerShift project file: missing core project attributes');
  }
  return {
    id: data.id || `proj_${Date.now()}`,
    name: data.name || 'Imported Project',
    createdAt: data.createdAt || Date.now(),
    updatedAt: Date.now(),
    image: data.image || null,
    layers: data.layers || [],
    canvasWidth: data.canvasWidth || 800,
    canvasHeight: data.canvasHeight || 800
  };
}
