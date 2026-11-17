"""
LayerShift - Operation-Based Hybrid Editing Engine
Routes each instruction to specialized processor based on detected operation type.
Supports: outline, fill, recolor, extract, remove, highlight, neon, background_remove,
          vectorize, segment, shadow, add_element, mask_edit, multi_segment, line_art
"""

import time
import logging
from typing import Dict, Any, Tuple, Optional, List
from services.instruction_parser import parse_instruction, EditingInstruction
from services.cv_segmentation import extract_features_from_image
from services.gemini_service import generate_layer_svg, get_active_api_key
from services.editing_pipeline import EditingPipeline, OperationType, process_editing_instruction

logger = logging.getLogger("layershift.hybrid")


def generate_hybrid_vector_layer(
    image_bytes: bytes,
    mime_type: str,
    user_prompt: str,
    width: int,
    height: int,
    settings: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], Optional[str], int, Dict[str, int]]:
    """
    Main entry point for generating vector layers based on operation type.
    Uses the EditingPipeline for operation-specific processing.
    Falls back to Gemini Vision for outline operations when API key available.
    Returns: (success, svg_markup, metadata, error_message, status_code, timing_dict)
    """
    settings = settings or {}
    mode = settings.get("generationMode", "precise").lower()
    t_start = time.time()
    timing: Dict[str, int] = {
        "preprocessing_ms": 0,
        "vision_analysis_ms": 0,
        "vector_synthesis_ms": 0,
        "validation_ms": 0,
        "total_ms": 0
    }

    # 1. Parse natural language prompt into strict EditingInstruction
    t_parse = time.time()
    instruction = parse_instruction(user_prompt, mode=mode)
    timing["preprocessing_ms"] = int((time.time() - t_parse) * 1000)

    # 2. Determine operation type
    pipeline = EditingPipeline()
    operation = pipeline._determine_operation(instruction, settings)

    # 3. Route to appropriate processor
    # For outline/line_art with Gemini available, try Gemini first
    gemini_operations = {OperationType.OUTLINE, OperationType.LINE_ART}
    has_key = bool(api_key or get_active_api_key())

    if has_key and operation in gemini_operations and mode == "precise":
        t_ai = time.time()
        ai_ok, ai_svg, ai_meta, ai_err, ai_code = generate_layer_svg(
            image_bytes=image_bytes,
            mime_type=mime_type,
            user_prompt=user_prompt,
            width=width,
            height=height,
            settings=settings,
            api_key=api_key
        )
        timing["vision_analysis_ms"] = int((time.time() - t_ai) * 1000)

        if ai_ok and ai_svg:
            timing["total_ms"] = int((time.time() - t_start) * 1000)
            ai_meta = ai_meta or {}
            ai_meta["timing"] = timing
            ai_meta["generation_mode"] = "precise"
            ai_meta["engine"] = "gemini_precise"
            ai_meta["operation"] = operation.value
            return True, ai_svg, ai_meta, None, 200, timing

        logger.info(f"Gemini call returned {ai_code} ({ai_err}). Using operation-based pipeline...")

    # Use operation-based pipeline for all other cases
    t_pipeline = time.time()
    result = process_editing_instruction(image_bytes, instruction, width, height, settings)
    timing["vector_synthesis_ms"] = int((time.time() - t_pipeline) * 1000)
    timing["total_ms"] = int((time.time() - t_start) * 1000)

    if result.success:
        meta = result.metadata
        meta["timing"] = timing
        meta["generation_mode"] = mode
        meta["engine"] = "editing_pipeline"
        meta["operation"] = result.operation.value
        return True, result.svg, meta, None, 200, timing
    else:
        # Fallback to basic CV extraction
        logger.warning(f"Pipeline failed: {result.error}. Falling back to basic CV extraction.")
        t_cv = time.time()
        ok, svg_markup, meta = extract_features_from_image(image_bytes, instruction)
        timing["vector_synthesis_ms"] = int((time.time() - t_cv) * 1000)
        timing["total_ms"] = int((time.time() - t_start) * 1000)
        meta["timing"] = timing
        meta["generation_mode"] = mode
        meta["engine"] = "local_cv_fallback"
        meta["operation"] = operation.value
        return ok, svg_markup, meta, None, 200, timing
