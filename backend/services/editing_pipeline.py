"""
LayerShift - Operation-Based Editing Pipeline
Routes each instruction to the correct specialized processor.
Supports: outline, fill, recolor, extract, remove, highlight, neon, background_remove,
          vectorize, segment, shadow, add_element, mask_edit, multi_segment
"""

import cv2
import numpy as np
import time
from typing import Dict, Any, Tuple, List, Optional, Literal
from dataclasses import dataclass
from enum import Enum

from services.instruction_parser import EditingInstruction
from services.image_analyzer import analyze_image_structure, reconcile_prompt_with_image
from services.cv_segmentation import extract_features_from_image, contour_to_bezier_path
from services.vector_engine import generate_local_vector_layer


class OperationType(Enum):
    OUTLINE = "outline"
    FILL = "fill"
    RECOLOR = "recolor"
    EXTRACT = "extract"
    REMOVE = "remove"
    HIGHLIGHT = "highlight"
    NEON = "neon"
    BACKGROUND_REMOVE = "background_remove"
    VECTORIZE = "vectorize"
    SEGMENT = "segment"
    SHADOW = "shadow"
    ADD_ELEMENT = "add_element"
    MASK_EDIT = "mask_edit"
    MULTI_SEGMENT = "multi_segment"
    LINE_ART = "line_art"


@dataclass
class PipelineResult:
    success: bool
    svg: str
    metadata: Dict[str, Any]
    operation: OperationType
    masks: Optional[Dict[str, np.ndarray]] = None
    error: Optional[str] = None


class EditingPipeline:
    """
    Central pipeline that routes instructions to specialized processors.
    Each operation produces a transparent SVG overlay aligned to original image.
    """

    def __init__(self):
        self.operation_map = {
            OperationType.OUTLINE: self._process_outline,
            OperationType.FILL: self._process_fill,
            OperationType.RECOLOR: self._process_recolor,
            OperationType.EXTRACT: self._process_extract,
            OperationType.REMOVE: self._process_remove,
            OperationType.HIGHLIGHT: self._process_highlight,
            OperationType.NEON: self._process_neon,
            OperationType.BACKGROUND_REMOVE: self._process_background_remove,
            OperationType.VECTORIZE: self._process_vectorize,
            OperationType.SEGMENT: self._process_segment,
            OperationType.SHADOW: self._process_shadow,
            OperationType.ADD_ELEMENT: self._process_add_element,
            OperationType.MASK_EDIT: self._process_mask_edit,
            OperationType.MULTI_SEGMENT: self._process_multi_segment,
            OperationType.LINE_ART: self._process_line_art,
        }

    def process(
        self,
        image_bytes: bytes,
        instruction: EditingInstruction,
        width: int,
        height: int,
        settings: Optional[Dict[str, Any]] = None
    ) -> PipelineResult:
        """Main entry point - routes to appropriate processor based on parsed intent."""
        settings = settings or {}
        operation = self._determine_operation(instruction, settings)

        processor = self.operation_map.get(operation)
        if not processor:
            return PipelineResult(
                success=False,
                svg="",
                metadata={},
                operation=operation,
                error=f"Unknown operation: {operation}"
            )

        try:
            return processor(image_bytes, instruction, width, height, settings)
        except Exception as e:
            return PipelineResult(
                success=False,
                svg="",
                metadata={},
                operation=operation,
                error=f"Processing failed: {str(e)}"
            )

    def _determine_operation(self, instruction: EditingInstruction, settings: Dict) -> OperationType:
        """Maps parsed instruction to operation type."""
        prompt = instruction.raw_prompt.lower()
        layer_type = settings.get("layerType", "").lower()

        # FIRST: Check prompt keywords for explicit operation intent
        # This must come before checking instruction.operation since parser defaults to "outline"

        if any(w in prompt for w in ["background remove", "remove background", "transparent background", "make background transparent"]):
            return OperationType.BACKGROUND_REMOVE
        if any(w in prompt for w in ["recolor", "change color", "change the color", "colorize"]):
            return OperationType.RECOLOR
        if any(w in prompt for w in ["fill", "flat color", "color fill", "solid fill"]):
            return OperationType.FILL
        if any(w in prompt for w in ["extract", "isolate", "separate layer", "cut out"]):
            return OperationType.EXTRACT
        if any(w in prompt for w in ["remove object", "delete object", "erase object", "remove the", "erase the"]):
            return OperationType.REMOVE
        if any(w in prompt for w in ["highlight", "mark", "accent", "emphasize"]):
            return OperationType.HIGHLIGHT
        if any(w in prompt for w in ["neon", "glow", "glowing", "neon glow"]):
            return OperationType.NEON
        if any(w in prompt for w in ["shadow", "drop shadow", "cast shadow"]):
            return OperationType.SHADOW
        if any(w in prompt for w in ["add crown", "place crown", "crown on", "crown above", "tiara", "coronet"]):
            return OperationType.ADD_ELEMENT
        if any(w in prompt for w in ["add bow", "place bow", "bow on", "ribbon on", "bow tie", "hair bow"]):
            return OperationType.ADD_ELEMENT
        if any(w in prompt for w in ["bow", "ribbon", "hair bow", "bow tie"]):
            return OperationType.ADD_ELEMENT
        if any(w in prompt for w in ["sunglasses", "glasses", "shades", "spectacles", "goggles", "visor", "eyewear"]):
            return OperationType.ADD_ELEMENT
        if any(w in prompt for w in ["outline", "contour", "silhouette", "stroke", "border", "edge", "ink"]):
            return OperationType.OUTLINE
        if any(w in prompt for w in ["add", "insert", "place", "new element", "glow aura", "aura around"]):
            return OperationType.ADD_ELEMENT
        if any(w in prompt for w in ["mask", "select region", "edit mask", "create mask"]):
            return OperationType.MASK_EDIT
        if any(w in prompt for w in ["separate", "split", "multi", "decompose", "multiple layers", "decompose into"]):
            return OperationType.MULTI_SEGMENT
        if any(w in prompt for w in ["line art", "clean line", "vectorize", "trace", "inking", "lineart"]):
            return OperationType.LINE_ART
        if any(w in prompt for w in ["vectorize", "convert to vector", "svg convert"]):
            return OperationType.VECTORIZE
        if any(w in prompt for w in ["segment", "segmentation"]):
            return OperationType.SEGMENT

        # SECOND: Check explicit instruction.operation
        op = instruction.operation.lower()
        op_map = {
            "outline": OperationType.OUTLINE,
            "fill": OperationType.FILL,
            "recolor": OperationType.RECOLOR,
            "extract": OperationType.EXTRACT,
            "remove": OperationType.REMOVE,
            "highlight": OperationType.HIGHLIGHT,
            "neon": OperationType.NEON,
            "line_art": OperationType.LINE_ART,
            "line-art": OperationType.LINE_ART,
            "vectorize": OperationType.VECTORIZE,
            "segment": OperationType.SEGMENT,
        }

        if op in op_map:
            return op_map[op]

        # Default based on layer type
        if layer_type in ("flat-color", "flat_color"):
            return OperationType.FILL
        if layer_type in ("background",):
            return OperationType.BACKGROUND_REMOVE

        return OperationType.OUTLINE

    # ============================================================
    # OPERATION PROCESSORS
    # ============================================================

    def _process_outline(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Generate outline/contour overlay - uses existing cv_segmentation."""
        # Leverage existing extract_features_from_image with outline intent
        modified_instruction = EditingInstruction(
            raw_prompt=instruction.raw_prompt,
            target_subject=instruction.target_subject,
            target_region=instruction.target_region,
            operation="outline",
            color_name=instruction.color_name,
            color_hex=instruction.color_hex,
            stroke_width=instruction.stroke_width,
            style="clean_vector",
            preserve_elements=instruction.preserve_elements,
            exclude_elements=instruction.exclude_elements,
            multi_layer=False,
            requested_layers=[],
            mode=instruction.mode
        )
        ok, svg, meta = extract_features_from_image(image_bytes, modified_instruction)
        meta["operation"] = "outline"
        return PipelineResult(success=ok, svg=svg, metadata=meta, operation=OperationType.OUTLINE)

    def _process_line_art(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Generate complete line art tracing."""
        modified_instruction = EditingInstruction(
            raw_prompt=instruction.raw_prompt,
            target_subject=instruction.target_subject,
            target_region="complete_line_art",
            operation="line_art",
            color_name=instruction.color_name,
            color_hex=instruction.color_hex,
            stroke_width=instruction.stroke_width,
            style="clean_vector",
            preserve_elements=instruction.preserve_elements,
            exclude_elements=instruction.exclude_elements,
            multi_layer=False,
            requested_layers=[],
            mode=instruction.mode
        )
        ok, svg, meta = extract_features_from_image(image_bytes, modified_instruction)
        meta["operation"] = "line_art"
        return PipelineResult(success=ok, svg=svg, metadata=meta, operation=OperationType.LINE_ART)

    def _process_fill(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Smart color fill - creates filled vector shapes for the target region."""
        # Create mask for the target region
        analysis = analyze_image_structure(image_bytes)
        mask = self._create_region_mask(image_bytes, instruction.target_region, analysis, width, height)

        if mask is None:
            return PipelineResult(
                success=False, svg="", metadata={}, operation=OperationType.FILL,
                error="Could not create region mask for fill"
            )

        # Generate fill SVG using target color
        fill_color = instruction.color_hex or "#C7FF4A"
        svg = self._mask_to_fill_svg(mask, fill_color, width, height, instruction.target_region)

        meta = {
            "operation": "fill",
            "target_region": instruction.target_region,
            "color": fill_color,
            "width": width,
            "height": height,
            "element_count": 1,
            "layer_name": f"{instruction.target_region.replace('_', ' ').title()} Fill ({instruction.color_name.title()})",
            "path_count": 1,
            "shape_count": 0,
            "stroke_width": instruction.stroke_width,
            "preserve_elements": instruction.preserve_elements,
            "exclude_elements": instruction.exclude_elements,
            "complexity_score": 12,
            "image_understanding": {
                "inferred_category": analysis.get("inferred_category", "object"),
                "mismatch_detected": False,
                "adaptation_note": ""
            },
            "instruction": instruction.to_dict()
        }
        return PipelineResult(success=True, svg=svg, metadata=meta, operation=OperationType.FILL, masks={"fill": mask})

    def _process_recolor(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Selective recoloring of specific region."""
        # Analyze image to get region mask, then generate fill with target color
        analysis = analyze_image_structure(image_bytes)
        mask = self._create_region_mask(image_bytes, instruction.target_region, analysis, width, height)

        if mask is None:
            return PipelineResult(
                success=False, svg="", metadata={}, operation=OperationType.RECOLOR,
                error="Could not create region mask for recoloring"
            )

        # Generate fill SVG using target color
        svg = self._mask_to_fill_svg(mask, instruction.color_hex, width, height, instruction.target_region)
        meta = {
            "operation": "recolor",
            "target_region": instruction.target_region,
            "color": instruction.color_hex,
            "width": width,
            "height": height,
            "element_count": 1
        }
        return PipelineResult(success=True, svg=svg, metadata=meta, operation=OperationType.RECOLOR, masks={"region": mask})

    def _process_extract(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Extract object as editable vector layer with transparent background."""
        # Use cv_segmentation for precise extraction
        modified_instruction = EditingInstruction(
            raw_prompt=instruction.raw_prompt,
            target_subject=instruction.target_subject,
            target_region=instruction.target_region,
            operation="extract",
            color_name=instruction.color_name,
            color_hex=instruction.color_hex,
            stroke_width=instruction.stroke_width,
            style="clean_vector",
            preserve_elements=instruction.preserve_elements,
            exclude_elements=instruction.exclude_elements,
            multi_layer=False,
            requested_layers=[],
            mode=instruction.mode
        )
        ok, svg, meta = extract_features_from_image(image_bytes, modified_instruction)
        meta["operation"] = "extract"
        return PipelineResult(success=ok, svg=svg, metadata=meta, operation=OperationType.EXTRACT)

    def _process_remove(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Object removal - generates inpainting mask (returns mask for frontend)."""
        analysis = analyze_image_structure(image_bytes)
        mask = self._create_region_mask(image_bytes, instruction.target_region, analysis, width, height)

        if mask is None:
            return PipelineResult(
                success=False, svg="", metadata={}, operation=OperationType.REMOVE,
                error="Could not create removal mask"
            )

        # Generate visual indicator of removal area (red overlay)
        svg = self._mask_to_indicator_svg(mask, "#FF4444", width, height, f"remove-{instruction.target_region}")
        meta = {
            "operation": "remove",
            "target_region": instruction.target_region,
            "width": width,
            "height": height,
            "removal_mask_generated": True,
            "note": "Mask generated for inpainting. Frontend should apply inpainting to original image."
        }
        return PipelineResult(success=True, svg=svg, metadata=meta, operation=OperationType.REMOVE, masks={"removal": mask})

    def _process_highlight(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Highlight/accent specific region."""
        analysis = analyze_image_structure(image_bytes)
        mask = self._create_region_mask(image_bytes, instruction.target_region, analysis, width, height)

        if mask is None:
            return PipelineResult(
                success=False, svg="", metadata={}, operation=OperationType.HIGHLIGHT,
                error="Could not create highlight mask"
            )

        # Generate highlight overlay (semi-transparent colored region)
        highlight_color = instruction.color_hex or "#FFFF00"
        svg = self._mask_to_highlight_svg(mask, highlight_color, width, height, instruction.target_region)
        meta = {
            "operation": "highlight",
            "target_region": instruction.target_region,
            "color": highlight_color,
            "width": width,
            "height": height
        }
        return PipelineResult(success=True, svg=svg, metadata=meta, operation=OperationType.HIGHLIGHT, masks={"highlight": mask})

    def _process_neon(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Neon glow outline effect."""
        # Get outline first, then add glow filters
        modified_instruction = EditingInstruction(
            raw_prompt=instruction.raw_prompt,
            target_subject=instruction.target_subject,
            target_region=instruction.target_region,
            operation="outline",
            color_name=instruction.color_name,
            color_hex=instruction.color_hex,
            stroke_width=instruction.stroke_width,
            style="neon",
            preserve_elements=instruction.preserve_elements,
            exclude_elements=instruction.exclude_elements,
            multi_layer=False,
            requested_layers=[],
            mode=instruction.mode
        )
        ok, svg, meta = extract_features_from_image(image_bytes, modified_instruction)

        if ok:
            # Add neon glow filter to SVG
            svg = self._add_neon_glow(svg, instruction.color_hex)
            meta["operation"] = "neon"
            meta["glow_applied"] = True
        return PipelineResult(success=ok, svg=svg, metadata=meta, operation=OperationType.NEON)

    def _process_background_remove(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Background removal - generates subject mask and transparent overlay."""
        analysis = analyze_image_structure(image_bytes)
        bounds = analysis.get("subject_bounds", {})

        # Create subject mask using grabcut-like approach
        mask = self._create_subject_mask(image_bytes, bounds, width, height)

        if mask is None:
            return PipelineResult(
                success=False, svg="", metadata={}, operation=OperationType.BACKGROUND_REMOVE,
                error="Could not create subject mask"
            )

        # Generate subject outline as SVG (background removed = subject isolated)
        modified_instruction = EditingInstruction(
            raw_prompt=instruction.raw_prompt,
            target_subject=instruction.target_subject,
            target_region="full_silhouette",
            operation="outline",
            color_name=instruction.color_name,
            color_hex=instruction.color_hex,
            stroke_width=instruction.stroke_width,
            style="clean_vector",
            preserve_elements=[],
            exclude_elements=["background"],
            multi_layer=False,
            requested_layers=[],
            mode=instruction.mode
        )
        ok, svg, meta = extract_features_from_image(image_bytes, modified_instruction)
        meta["operation"] = "background_remove"
        meta["subject_mask_generated"] = True
        return PipelineResult(success=ok, svg=svg, metadata=meta, operation=OperationType.BACKGROUND_REMOVE, masks={"subject": mask})

    def _process_vectorize(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Full image-to-vector conversion."""
        modified_instruction = EditingInstruction(
            raw_prompt=instruction.raw_prompt,
            target_subject=instruction.target_subject,
            target_region="complete_line_art",
            operation="vectorize",
            color_name=instruction.color_name,
            color_hex=instruction.color_hex,
            stroke_width=max(1.5, instruction.stroke_width * 0.7),
            style="clean_vector",
            preserve_elements=instruction.preserve_elements,
            exclude_elements=instruction.exclude_elements,
            multi_layer=False,
            requested_layers=[],
            mode=instruction.mode
        )
        ok, svg, meta = extract_features_from_image(image_bytes, modified_instruction)
        meta["operation"] = "vectorize"
        return PipelineResult(success=ok, svg=svg, metadata=meta, operation=OperationType.VECTORIZE)

    def _process_segment(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Semantic segmentation - extracts specific region as editable layer."""
        return self._process_extract(image_bytes, instruction, width, height, settings)

    def _process_shadow(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Generate drop shadow for subject."""
        analysis = analyze_image_structure(image_bytes)
        bounds = analysis.get("subject_bounds", {})

        min_x = bounds.get("x", int(width * 0.1))
        min_y = bounds.get("y", int(height * 0.1))
        subj_w = bounds.get("width", int(width * 0.8))
        subj_h = bounds.get("height", int(height * 0.8))
        max_x = min_x + subj_w
        max_y = min_y + subj_h
        cx = (min_x + max_x) // 2
        cy = (min_y + max_y) // 2

        shadow_color = instruction.color_hex or "#000000"
        offset_x = int(subj_w * 0.05)
        offset_y = int(subj_h * 0.08)
        blur = int(min(subj_w, subj_h) * 0.03)

        # Create shadow SVG with filter
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <defs>
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="blur"/>
      <feOffset dx="{offset_x}" dy="{offset_y}" result="offsetBlur"/>
      <feFlood flood-color="{shadow_color}" flood-opacity="0.4"/>
      <feComposite in2="offsetBlur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#dropShadow)">
    <ellipse cx="{cx}" cy="{max_y + int(subj_h * 0.05)}" rx="{int(subj_w * 0.4)}" ry="{int(subj_h * 0.08)}" fill="{shadow_color}" opacity="0.3"/>
  </g>
</svg>"""

        meta = {
            "operation": "shadow",
            "width": width,
            "height": height,
            "shadow_color": shadow_color,
            "offset_x": offset_x,
            "offset_y": offset_y,
            "blur": blur
        }
        return PipelineResult(success=True, svg=svg, metadata=meta, operation=OperationType.SHADOW)

    def _process_add_element(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Add decorative vector element (crown, bow, sunglasses, glow, aura, geometric accent)."""
        analysis = analyze_image_structure(image_bytes)
        bounds = analysis.get("subject_bounds", {})

        min_x = bounds.get("x", int(width * 0.1))
        min_y = bounds.get("y", int(height * 0.1))
        subj_w = bounds.get("width", int(width * 0.8))
        subj_h = bounds.get("height", int(height * 0.8))
        max_x = min_x + subj_w
        max_y = min_y + subj_h
        cx = (min_x + max_x) // 2
        cy = (min_y + max_y) // 2

        color = instruction.color_hex or "#C7FF4A"
        element_type = self._infer_element_type(instruction.raw_prompt)

        # Head position for accessories
        head_y_min = min_y
        head_y_max = min_y + int(subj_h * 0.35)
        head_cx = cx
        head_cy = min_y + int(subj_h * 0.18)  # Eye/head center

        if element_type == "crown":
            # Crown positioned above the head, sized to the head width.
            # Head width is estimated from the upper third of the subject.
            head_width = int(subj_w * 0.62)
            head_top = min_y
            crown_h = int(subj_h * 0.13)
            base_y = head_top - int(crown_h * 0.15)
            top_y = base_y - crown_h
            left_x = cx - head_width // 2
            right_x = cx + head_width // 2

            crown_path = (
                f"M {left_x} {base_y} "
                f"L {left_x} {base_y - crown_h * 0.55} "
                f"L {left_x + head_width * 0.18} {top_y + crown_h * 0.35} "
                f"L {cx} {top_y} "
                f"L {right_x - head_width * 0.18} {top_y + crown_h * 0.35} "
                f"L {right_x} {base_y - crown_h * 0.55} "
                f"L {right_x} {base_y} Z"
            )

            svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <g id="crown-layer" filter="drop-shadow(0px 6px 14px rgba(255,215,0,0.5))">
    <path d="{crown_path}" fill="{color}" stroke="#FFA500" stroke-width="3" stroke-linejoin="round" />
    <rect x="{left_x}" y="{base_y - 8}" width="{head_width}" height="10" rx="3" fill="#FFA500" stroke="{color}" stroke-width="1.5" />
    <circle cx="{cx}" cy="{top_y - 3}" r="7" fill="#FFD700" stroke="#FFFFFF" stroke-width="2" />
    <circle cx="{left_x + head_width * 0.25}" cy="{top_y + crown_h * 0.35 - 3}" r="5" fill="{color}" stroke="#FFFFFF" stroke-width="1.5" />
    <circle cx="{right_x - head_width * 0.25}" cy="{top_y + crown_h * 0.35 - 3}" r="5" fill="{color}" stroke="#FFFFFF" stroke-width="1.5" />
  </g>
</svg>"""

        elif element_type == "bow":
            # Bow on head (side or top)
            bow_size = int(subj_w * 0.12)
            bow_x = head_cx + int(subj_w * 0.15)  # Right side of head
            bow_y = head_y_min + int(subj_h * 0.08)

            svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <g id="bow-layer" transform="translate({bow_x}, {bow_y}) rotate(-15)">
    <path d="M 0 0 Q -{bow_size} -{bow_size//2} -{bow_size} 0 Q -{bow_size} {bow_size//2} 0 0 Q -{bow_size//2} 0 -{bow_size//3} 0 Z" fill="{color}" stroke="#FFFFFF" stroke-width="1" />
    <path d="M 0 0 Q {bow_size} -{bow_size//2} {bow_size} 0 Q {bow_size} {bow_size//2} 0 0 Q {bow_size//2} 0 {bow_size//3} 0 Z" fill="{color}" stroke="#FFFFFF" stroke-width="1" />
    <circle cx="0" cy="0" r="{bow_size//3}" fill="#FFFFFF" stroke="{color}" stroke-width="1" opacity="0.3" />
  </g>
</svg>"""

        elif element_type == "sunglasses":
            # Sunglasses over eyes
            lens_w = int(subj_w * 0.22)
            lens_h = int(subj_h * 0.08)
            gap = int(subj_w * 0.06)
            top_y = head_cy - lens_h // 2
            l1_x = head_cx - gap // 2 - lens_w
            l2_x = head_cx + gap // 2

            defs_svg = """<defs>
    <linearGradient id="lensGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1A1C23" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#3A3F4D" stop-opacity="0.9" />
    </linearGradient>
  </defs>"""

            svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  {defs_svg}
  <g id="sunglasses-layer" filter="drop-shadow(0px 8px 16px rgba(0,0,0,0.6))">
    <path d="M {l1_x + lens_w} {top_y + 8} Q {head_cx} {top_y + 4} {l2_x} {top_y + 8}" stroke="{color}" stroke-width="4" fill="none" stroke-linecap="round" />
    <rect x="{l1_x}" y="{top_y}" width="{lens_w}" height="{lens_h}" rx="8" fill="url(#lensGrad)" stroke="{color}" stroke-width="3.5" />
    <path d="M {l1_x + 8} {top_y + 6} L {l1_x + lens_w - 12} {top_y + 6}" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.6" />
    <rect x="{l2_x}" y="{top_y}" width="{lens_w}" height="{lens_h}" rx="8" fill="url(#lensGrad)" stroke="{color}" stroke-width="3.5" />
    <path d="M {l2_x + 8} {top_y + 6} L {l2_x + lens_w - 12} {top_y + 6}" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.6" />
    <path d="M {l1_x} {top_y + 8} L {max(0, l1_x - int(subj_w*0.15))} {top_y + 4}" stroke="{color}" stroke-width="3" stroke-linecap="round" />
    <path d="M {l2_x + lens_w} {top_y + 8} L {min(width, l2_x + lens_w + int(subj_w*0.15))} {top_y + 4}" stroke="{color}" stroke-width="3" stroke-linecap="round" />
  </g>
</svg>"""

        elif element_type == "glow":
            # Outer glow around subject
            svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <defs>
    <radialGradient id="outerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{color}" stop-opacity="0.3"/>
      <stop offset="70%" stop-color="{color}" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="{color}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glowBlur">
      <feGaussianBlur stdDeviation="15" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <ellipse cx="{cx}" cy="{cy}" rx="{int(subj_w * 0.6)}" ry="{int(subj_h * 0.6)}" fill="url(#outerGlow)" filter="url(#glowBlur)"/>
</svg>"""
        elif element_type == "aura":
            # Multiple concentric rings
            rings = []
            for i in range(5):
                r = int(max(subj_w, subj_h) * (0.5 + i * 0.15))
                opacity = 0.15 - i * 0.025
                rings.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{color}" stroke-width="2" fill="none" opacity="{opacity}"/>')
            svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  {' '.join(rings)}
</svg>"""
        else:
            # Default: accent line
            svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <path d="M {min_x} {cy} Q {cx} {min_y} {max_x} {cy}" stroke="{color}" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>"""

        meta = {
            "operation": "add_element",
            "element_type": element_type,
            "color": color,
            "width": width,
            "height": height,
            "layer_name": f"{element_type.title()} ({instruction.color_name.title()})",
            "complexity_score": 15
        }
        return PipelineResult(success=True, svg=svg, metadata=meta, operation=OperationType.ADD_ELEMENT)

    def _process_mask_edit(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Returns mask for manual editing - generates editable mask overlay."""
        analysis = analyze_image_structure(image_bytes)
        mask = self._create_region_mask(image_bytes, instruction.target_region, analysis, width, height)

        if mask is None:
            return PipelineResult(
                success=False, svg="", metadata={}, operation=OperationType.MASK_EDIT,
                error="Could not create editable mask"
            )

        # Generate mask visualization (red overlay with adjustable opacity)
        svg = self._mask_to_indicator_svg(mask, "#FF6B6B", width, height, f"mask-{instruction.target_region}", opacity=0.4)
        meta = {
            "operation": "mask_edit",
            "target_region": instruction.target_region,
            "width": width,
            "height": height,
            "editable": True,
            "note": "Mask generated for manual editing. Adjust opacity/visibility in layer inspector."
        }
        return PipelineResult(success=True, svg=svg, metadata=meta, operation=OperationType.MASK_EDIT, masks={"editable": mask})

    def _process_multi_segment(self, image_bytes, instruction, width, height, settings) -> PipelineResult:
        """Decompose image into multiple independent layers."""
        analysis = analyze_image_structure(image_bytes)
        category = analysis.get("inferred_category", "object")

        # Define layer decomposition per category
        decompositions = {
            "vehicle": ["body_silhouette", "wheels", "windows"],
            "architecture": ["facade", "roof", "windows"],
            "portrait": ["hair", "face", "clothing"],
            "cartoon_character": ["body_silhouette", "face", "accessories"],
            "animal": ["body_silhouette", "head", "details"],
            "product": ["chassis", "details", "logo"],
            "logo": ["main_shape", "icon", "text"],
            "landscape": ["foreground", "midground", "background"]
        }

        regions = decompositions.get(category, ["full_silhouette", "details"])
        layers = []

        for region in regions:
            mod_inst = EditingInstruction(
                raw_prompt=f"Extract {region}",
                target_subject=instruction.target_subject,
                target_region=region,
                operation="extract",
                color_name=instruction.color_name,
                color_hex=instruction.color_hex,
                stroke_width=instruction.stroke_width,
                style="clean_vector",
                preserve_elements=[],
                exclude_elements=[],
                multi_layer=True,
                requested_layers=regions,
                mode=instruction.mode
            )
            ok, svg, meta = extract_features_from_image(image_bytes, mod_inst)
            if ok:
                layers.append({"region": region, "svg": svg, "metadata": meta})

        # Return combined SVG with all layers in separate groups
        combined_svg = self._combine_layers(layers, width, height)
        meta = {
            "operation": "multi_segment",
            "category": category,
            "layers": [l["region"] for l in layers],
            "layer_count": len(layers),
            "width": width,
            "height": height
        }
        return PipelineResult(success=True, svg=combined_svg, metadata=meta, operation=OperationType.MULTI_SEGMENT)

    # ============================================================
    # HELPER METHODS
    # ============================================================

    def _create_region_mask(self, image_bytes, target_region, analysis, width, height) -> Optional[np.ndarray]:
        """Create binary mask for a specific semantic region."""
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return None

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            bounds = analysis.get("subject_bounds", {})
            min_x = bounds.get("x", int(width * 0.1))
            min_y = bounds.get("y", int(height * 0.1))
            subj_w = bounds.get("width", int(width * 0.8))
            subj_h = bounds.get("height", int(height * 0.8))
            max_x = min_x + subj_w
            max_y = min_y + subj_h
            cx = (min_x + max_x) // 2
            cy = (min_y + max_y) // 2

            is_light_bg = analysis.get("is_light_bg", True)
            filtered = cv2.bilateralFilter(gray, 5, 40, 40)
            if is_light_bg:
                contrast = cv2.adaptiveThreshold(
                    filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY_INV, 21, 10
                )
            else:
                _, contrast = cv2.threshold(filtered, 45, 255, cv2.THRESH_BINARY)

            mask = np.zeros((height, width), dtype=np.uint8)

            if target_region in ("eyes", "glasses"):
                y1, y2 = min_y + int(subj_h * 0.15), min_y + int(subj_h * 0.38)
                x1, x2 = min_x + int(subj_w * 0.15), max_x - int(subj_w * 0.15)
                mask[y1:y2, x1:x2] = contrast[y1:y2, x1:x2]
            elif target_region == "hair":
                y2 = min_y + int(subj_h * 0.42)
                mask[min_y:y2, min_x:max_x] = contrast[min_y:y2, min_x:max_x]
            elif target_region == "whiskers":
                y1, y2 = min_y + int(subj_h * 0.22), min_y + int(subj_h * 0.42)
                mask[y1:y2, max(0, min_x-30):cx-15] = contrast[y1:y2, max(0, min_x-30):cx-15]
                mask[y1:y2, cx+15:min(width, max_x+30)] = contrast[y1:y2, cx+15:min(width, max_x+30)]
            elif target_region == "body_silhouette":
                y1 = min_y + int(subj_h * 0.32)
                mask[y1:max_y, min_x:max_x] = contrast[y1:max_y, min_x:max_x]
                # Morphological close
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
                mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            elif target_region == "wheels":
                y1 = cy
                mask[y1:max_y, min_x:max_x] = contrast[y1:max_y, min_x:max_x]
            elif target_region == "windows":
                y1, y2 = min_y + int(subj_h * 0.20), min_y + int(subj_h * 0.65)
                mask[y1:y2, min_x:max_x] = contrast[y1:y2, min_x:max_x]
            elif target_region == "roof":
                y2 = min_y + int(subj_h * 0.38)
                mask[min_y:y2, min_x:max_x] = contrast[min_y:y2, min_x:max_x]
            elif target_region == "mouth":
                y1, y2 = min_y + int(subj_h * 0.35), min_y + int(subj_h * 0.55)
                x1, x2 = min_x + int(subj_w * 0.25), max_x - int(subj_w * 0.25)
                mask[y1:y2, x1:x2] = contrast[y1:y2, x1:x2]
            elif target_region == "clothing":
                y1, y2 = min_y + int(subj_h * 0.35), max_y
                mask[y1:y2, min_x:max_x] = contrast[y1:y2, min_x:max_x]
            elif target_region in ("mountains", "background", "full_silhouette"):
                # Full subject mask
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
                closed = cv2.morphologyEx(contrast, cv2.MORPH_CLOSE, kernel)
                dilated = cv2.dilate(closed, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
                cnts, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if cnts:
                    largest = max(cnts, key=cv2.contourArea)
                    cv2.fillPoly(mask, [largest], 255)
            else:
                # Default: use full subject bounds
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
                closed = cv2.morphologyEx(contrast, cv2.MORPH_CLOSE, kernel)
                cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if cnts:
                    largest = max(cnts, key=cv2.contourArea)
                    cv2.fillPoly(mask, [largest], 255)

            return mask if np.any(mask > 0) else None
        except Exception:
            return None

    def _create_subject_mask(self, image_bytes, bounds, width, height) -> Optional[np.ndarray]:
        """Create subject mask for background removal."""
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return None

            # Simple grabcut-based approach
            mask = np.zeros(img.shape[:2], np.uint8)
            rect = (bounds.get("x", 50), bounds.get("y", 50), bounds.get("width", width-100), bounds.get("height", height-100))

            bgd_model = np.zeros((1, 65), np.float64)
            fgd_model = np.zeros((1, 65), np.float64)

            try:
                cv2.grabCut(img, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
                mask2 = np.where((mask == 2) | (mask == 0), 0, 255).astype('uint8')
                return cv2.resize(mask2, (width, height))
            except:
                # Fallback: threshold-based
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                _, thresh = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
                return cv2.resize(thresh, (width, height))
        except Exception:
            return None

    def _mask_to_fill_svg(self, mask, color, width, height, region_name) -> str:
        """Convert binary mask to filled SVG path."""
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return self._fallback_svg(width, height)

        paths = []
        for cnt in contours:
            if cv2.contourArea(cnt) > 50:
                peri = cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, max(2.0, 0.005 * peri), True)
                d = contour_to_bezier_path(approx, closed=True)
                if d:
                    paths.append(f'<path d="{d}" fill="{color}" fill-opacity="0.85" stroke="none"/>')

        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <g id="fill-{region_name}">\n    {' '.join(paths)}\n  </g>
</svg>"""

    def _mask_to_highlight_svg(self, mask, color, width, height, region_name) -> str:
        """Convert mask to highlight overlay (semi-transparent)."""
        return self._mask_to_fill_svg(mask, color, width, height, region_name).replace('fill-opacity="0.85"', 'fill-opacity="0.35"')

    def _mask_to_indicator_svg(self, mask, color, width, height, region_name, opacity=0.5) -> str:
        """Convert mask to indicator overlay for editing."""
        return self._mask_to_fill_svg(mask, color, width, height, region_name).replace('fill-opacity="0.85"', f'fill-opacity="{opacity}"')

    def _add_neon_glow(self, svg: str, color: str) -> str:
        """Add neon glow filter to existing SVG.

        The glow filter is injected INSIDE the root <svg> element (after the
        opening tag and any existing <defs>), never before it. Injecting it
        before <svg> produced invalid markup that broke SVG parsers/renderers.
        """
        glow_filter = (
            f'<filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">'
            f'<feGaussianBlur stdDeviation="8" result="blur"/>'
            f'<feMerge>'
            f'<feMergeNode in="blur"/>'
            f'<feMergeNode in="blur"/>'
            f'<feMergeNode in="SourceGraphic"/>'
            f'</feMerge>'
            f'</filter>'
        )

        if "<defs>" in svg:
            # Insert the glow filter into the existing <defs> block.
            svg = svg.replace("<defs>", "<defs>\n    " + glow_filter, 1)
        else:
            # No <defs> present: create one right after the opening <svg> tag.
            svg = svg.replace("<svg", "<svg>\n  <defs>\n    " + glow_filter + "\n  </defs>", 1)

        # Add filter to path/stroke elements
        svg = svg.replace('stroke="', 'filter="url(#neonGlow)" stroke="')
        return svg

    def _infer_element_type(self, prompt: str) -> str:
        p = prompt.lower()
        # Order matters: check specific element types before generic ones
        if any(w in p for w in ["crown", "tiara", "coronet", "halo", "horns"]):
            return "crown"
        if any(w in p for w in ["bow", "ribbon", "hair bow", "bow tie"]):
            return "bow"
        if any(w in p for w in ["sunglasses", "glasses", "shades", "spectacles", "goggles", "visor", "eyewear"]):
            return "sunglasses"
        if any(w in p for w in ["glow", "aura", "radiant", "radiance", "neon", "glowing"]):
            return "glow"
        if any(w in p for w in ["ring", "halo", "aura", "concentric"]):
            return "aura"
        return "accent"

    def _combine_layers(self, layers, width, height) -> str:
        """Combine multiple layer SVGs into one with separate groups."""
        groups = []
        for layer in layers:
            # Extract inner content from each layer's SVG
            svg = layer["svg"]
            start = svg.find(">") + 1
            end = svg.rfind("</svg>")
            if start > 0 and end > start:
                inner = svg[start:end].strip()
                groups.append(f'  <g id="multi-{layer["region"]}" data-region="{layer["region"]}">\n    {inner}\n  </g>')

        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
{chr(10).join(groups)}
</svg>"""

    def _fallback_svg(self, width, height) -> str:
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <rect x="10%" y="10%" width="80%" height="80%" rx="10" fill="#30343B" fill-opacity="0.5" stroke="#C7FF4A" stroke-width="2"/>
</svg>"""


# Convenience function for direct use
def process_editing_instruction(
    image_bytes: bytes,
    instruction: EditingInstruction,
    width: int,
    height: int,
    settings: Optional[Dict[str, Any]] = None
) -> PipelineResult:
    """Entry point for the editing pipeline."""
    pipeline = EditingPipeline()
    return pipeline.process(image_bytes, instruction, width, height, settings)