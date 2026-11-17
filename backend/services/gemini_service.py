"""
LayerShift - Gemini AI Integration Service
Connects to Google Gen AI SDK, generates editable SVG vector layers from raster images,
validates output, and handles self-repair and quota management.
"""

import os
import re
import time
import logging
import concurrent.futures
from typing import Dict, Any, Tuple, Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError

from services.svg_service import prepare_svg_for_layer
from utils.validation import extract_svg_content, sanitize_and_validate_svg

logger = logging.getLogger("layershift.gemini")

DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")

# In-memory runtime override for API key if set via UI Settings modal
_RUNTIME_API_KEY: Optional[str] = None
_RUNTIME_MODEL: Optional[str] = None


def set_runtime_api_key(api_key: str):
    """Sets runtime API key from frontend settings without requiring server restart."""
    global _RUNTIME_API_KEY
    _RUNTIME_API_KEY = api_key.strip() if api_key else None


def set_runtime_model(model_name: str):
    """Sets runtime model name."""
    global _RUNTIME_MODEL
    _RUNTIME_MODEL = model_name.strip() if model_name else None


def get_active_api_key() -> Optional[str]:
    """Returns active Gemini API key from runtime or environment."""
    return _RUNTIME_API_KEY or os.environ.get("GEMINI_API_KEY") or None


def get_active_model() -> str:
    """Returns active model identifier."""
    return _RUNTIME_MODEL or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL


def get_genai_client(api_key: Optional[str] = None) -> Tuple[Optional[genai.Client], Optional[str]]:
    """Creates an authenticated Google Gen AI client."""
    key = api_key or get_active_api_key()
    if not key:
        return None, "Gemini API key is not configured. Please add your GEMINI_API_KEY in backend/.env or enter it in the app Settings."
    try:
        client = genai.Client(api_key=key)
        return client, None
    except Exception as e:
        return None, f"Failed to initialize Gemini client: {str(e)}"


def test_gemini_connection(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None
) -> Tuple[bool, str, Optional[str]]:
    """
    Tests whether the provided or configured Gemini API key is valid and responsive.
    Performs actual vision generation test with a minimal image to verify full capability.
    Returns: (success, message, active_model)
    """
    key = (api_key or get_active_api_key() or "").strip()
    if not key:
        return False, "No Gemini API key provided. Please paste your Google AI Studio key.", None

    try:
        client = genai.Client(api_key=key)
    except Exception as e:
        return False, f"Failed to initialize Gemini client: {str(e)}", None

    target_model = model_name or get_active_model()
    candidate_models = [target_model, "gemini-3.6-flash", "gemini-flash-latest"]
    unique_models = []
    for m in candidate_models:
        if m and m not in unique_models:
            unique_models.append(m)

    # Create a minimal 1x1 pixel test image for vision testing
    import io
    from PIL import Image
    test_img = Image.new('RGB', (10, 10), color='white')
    buf = io.BytesIO()
    test_img.save(buf, format='PNG')
    test_img_bytes = buf.getvalue()

    last_error = ""
    for mod in unique_models:
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        try:
            future = executor.submit(
                lambda m=mod: client.models.generate_content(
                    model=m,
                    contents=[
                        genai.types.Part.from_bytes(data=test_img_bytes, mime_type="image/png"),
                        "Reply with: OK"
                    ],
                    config=genai.types.GenerateContentConfig(
                        temperature=0.1,
                        max_output_tokens=10
                    )
                )
            )
            resp = future.result(timeout=30)
            if resp and resp.text:
                return True, f"Gemini API key verified! Vision generation working with model '{mod}'.", mod
        except concurrent.futures.TimeoutError:
            last_error = f"Connection to {mod} timed out (30s)."
        except Exception as e:
            err_str = str(e)
            if "404" in err_str:
                last_error = f"Model {mod} is not available to this API key."
                continue
            elif "400" in err_str or "API_KEY_INVALID" in err_str:
                return False, "Invalid Gemini API key. Please check your key at https://aistudio.google.com/apikey", None
            elif "403" in err_str:
                return False, "API key permission error (403). Please verify permissions on your Google AI Studio project.", None
            elif "429" in err_str:
                last_error = f"Model {mod}: Quota exceeded (429)."
                continue  # Try next model
            elif "503" in err_str:
                last_error = f"Google server 503 for {mod}."
                continue
            else:
                last_error = f"Gemini test failed for {mod}: {err_str}"
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    return False, last_error or "Unable to connect to Gemini vision API.", None


def parse_quota_error(error_str: str) -> Dict[str, Any]:
    """Extracts quota details and retryDelay from error messages."""
    retry_delay_seconds = None
    # Look for retryDelay pattern in error text (e.g., 'retryDelay': '24s' or 'retry in 15 seconds')
    delay_match = re.search(r'retry(?:delay)?[\'":\s]+(\d+(?:\.\d+)?)\s*s?', error_str, re.IGNORECASE)
    if delay_match:
        try:
            retry_delay_seconds = float(delay_match.group(1))
        except ValueError:
            pass

    return {
        'is_quota_exhausted': True,
        'retry_delay_seconds': retry_delay_seconds,
        'message': "Gemini API Quota Exceeded (429 RESOURCE_EXHAUSTED). Please wait a moment before trying again or check your Google AI Studio quota and billing."
    }


def build_system_prompt(width: int, height: int, settings: Dict[str, Any]) -> str:
    """Constructs prompt for image-grounded SVG overlay generation."""
    layer_type = settings.get("layerType", "vector-layer")
    detail_level = settings.get("detailLevel", "balanced")
    vector_complexity = settings.get("vectorComplexity", "medium")
    preserve_colors = settings.get("colorPreservation", True)

    style_instructions = []
    if layer_type == "outline":
        style_instructions.append("Generate ONLY the requested outline/stroke paths as a transparent overlay. Do NOT fill shapes. Use clean strokes (stroke-width 2-4px) with fill='none'.")
    elif layer_type == "line-art":
        style_instructions.append("Generate ONLY clean line art stroke paths tracing existing edges in the image. No fills, no new details. fill='none' only.")
    elif layer_type == "flat-color":
        style_instructions.append("Generate ONLY flat color fill shapes for regions that EXIST in the original image. No outlines, no new shapes.")
    elif layer_type == "details":
        style_instructions.append("Generate ONLY the requested detail accents (eyes, whiskers, etc.) as minimal overlay elements. Do not trace full contours.")
    elif layer_type == "background":
        style_instructions.append("Generate ONLY background elements that exist in the image. Do not invent new scenery.")
    else:
        style_instructions.append("Generate ONLY the requested vector elements as transparent overlay layers matching existing image content.")

    if preserve_colors:
        style_instructions.append("Sample colors from the original image regions being traced. Do not invent new color schemes.")
    else:
        style_instructions.append("Use the user-specified stroke color. Keep fills transparent (fill='none').")

    return f"""You are LayerShift's AI vector overlay engine.
Your ONLY job: Generate a TRANSPARENT SVG overlay layer that EDITs the uploaded image — NOT a new illustration.

⛔ ABSOLUTE PROHIBITIONS — VIOLATION MEANS FAILURE:
- Do NOT output ANY background rectangle (<rect width="..." height="..." fill="...">) or full-canvas fill.
- Do NOT trace the subject's outline, silhouette, body, head, or contour UNLESS explicitly requested.
- Do NOT draw facial features (eyes, pupils, nose, mouth, eyebrows) UNLESS explicitly requested.
- Do NOT draw whiskers, fur texture, ear details, paw details UNLESS explicitly requested.
- Do NOT redraw ANY part of the original image — the original stays as the base layer.
- Do NOT create gradients, filters, or glows that cover the full canvas.
- Do NOT output a complete line-art trace of the image.
- Do NOT add any element the user did not explicitly ask for.

✅ MANDATORY REQUIREMENTS:
1. Output PURE SVG ONLY — no markdown, no explanations, no commentary.
2. Root SVG: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
3. Background MUST be transparent — NO <rect> covering canvas, NO opaque background.
4. Generate ONLY what the user explicitly requested — minimal, targeted overlay.
5. If user asks for "coral outline around subject" → generate ONLY the coral glow strokes, NOT the subject.
6. If user asks for "extract wheels" → generate ONLY wheel circles, NOT the car body.
7. Use fill="none" for all strokes. Use semantic <g id="..."> groups.
8. Detail level: '{detail_level}'. Complexity: '{vector_complexity}'.
9. {' '.join(style_instructions)}
10. Document MUST end with </svg>. All tags properly closed.
11. Coordinate system: 0,0 = top-left. Match original image pixels exactly.

REMEMBER: The original image is displayed BEHIND your SVG. Your SVG is an OVERLAY. Only add the NEW layer the user requested.
"""


def generate_layer_svg(
    image_bytes: bytes,
    mime_type: str,
    user_prompt: str,
    width: int,
    height: int,
    settings: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], Optional[str], Optional[int]]:
    """
    Calls Gemini API to generate an editable SVG layer matching the original image.
    Includes automatic repair retry if initial SVG is truncated or malformed.
    Returns: (success, svg_markup, layer_metadata, error_message, status_code)
    """
    settings = settings or {}
    client, client_err = get_genai_client(api_key)
    if not client:
        return False, None, None, client_err, 401

    model_name = get_active_model()
    system_prompt = build_system_prompt(width, height, settings)

    generation_prompt = f"""Target image dimensions: {width} x {height}.
User Request: {user_prompt.strip()}

⛔ YOU ARE GENERATING A TRANSPARENT OVERLAY ONLY. THE ORIGINAL IMAGE IS THE BASE LAYER.

ANALYZE the uploaded image. Then generate ONLY the SVG markup for the requested edit.

FORBIDDEN (will cause rejection):
- Any <rect> covering the canvas (background)
- Tracing the full subject outline/silhouette (unless explicitly asked)
- Drawing eyes, pupils, nose, mouth, whiskers, fur, ears (unless explicitly asked)
- Any gradient/filter covering large areas
- Complete line-art trace of the image
- Any element not in the user request

REQUIRED:
- Transparent background only
- viewBox="0 0 {width} {height}"
- ONLY the requested element (e.g., if "coral outline around subject" → ONLY coral glow strokes)
- fill="none" for strokes
- End with </svg>

Output the SVG overlay now:
"""

    start_time = time.time()

    try:
        # Optimize image payload: downscale guidance thumbnail for fast network transmission (max 768px, ~80KB JPEG)
        from PIL import Image
        import io
        try:
            pil_img = Image.open(io.BytesIO(image_bytes))
            if pil_img.width > 768 or pil_img.height > 768 or len(image_bytes) > 300 * 1024:
                pil_img.thumbnail((768, 768), Image.Resampling.LANCZOS)
                if pil_img.mode in ("RGBA", "P"):
                    pil_img = pil_img.convert("RGB")
                buf = io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=85, optimize=True)
                opt_bytes = buf.getvalue()
                opt_mime = "image/jpeg"
            else:
                opt_bytes = image_bytes
                opt_mime = mime_type
        except Exception:
            opt_bytes = image_bytes
            opt_mime = mime_type

        # Prepare content part for image
        image_part = types.Part.from_bytes(data=opt_bytes, mime_type=opt_mime)
        contents = [
            image_part,
            types.Part.from_text(text=generation_prompt)
        ]

        # Use deterministic, low-temperature config for vector code stability
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
            top_p=0.9
        )

        # Call Gemini model with 60s timeout for vision generation
        models_to_try = [model_name]
        # Add fallback models that support vision
        for fallback in ["gemini-3.6-flash", "gemini-flash-latest"]:
            if fallback not in models_to_try:
                models_to_try.append(fallback)

        response = None
        last_api_error = None
        selected_model_used = model_name

        for candidate_model in models_to_try:
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            try:
                def _call_api(m=candidate_model):
                    return client.models.generate_content(
                        model=m,
                        contents=contents,
                        config=config
                    )
                future = executor.submit(_call_api)
                response = future.result(timeout=60)
                selected_model_used = candidate_model
                break
            except concurrent.futures.TimeoutError:
                logger.warning(f"Gemini call to {candidate_model} timed out after 60s.")
                last_api_error = f"Gemini generation timed out (60s limit) for {candidate_model}."
                continue  # Try next fallback model
            except Exception as e:
                err_text = str(e)
                last_api_error = err_text
                logger.warning(f"Gemini call to {candidate_model} failed: {err_text}")
                # On quota/auth errors, don't try other models with same key
                if "400" in err_text or "403" in err_text or "429" in err_text or "API_KEY_INVALID" in err_text:
                    break
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

        if not response:
            if last_api_error and ("429" in last_api_error or "RESOURCE_EXHAUSTED" in last_api_error):
                q_info = parse_quota_error(last_api_error)
                return False, None, q_info, q_info["message"], 429
            return False, None, None, last_api_error or "Failed to receive response from Gemini API.", 500

        raw_output = response.text or ""
        duration_ms = int((time.time() - start_time) * 1000)

        # Attempt to prepare and validate SVG
        valid, svg_result, val_err, meta = prepare_svg_for_layer(
            raw_output,
            target_width=width,
            target_height=height,
            layer_name=settings.get("layerName", "Generated Layer")
        )

        if valid and svg_result:
            meta["generation_duration_ms"] = duration_ms
            meta["model"] = selected_model_used
            meta["is_repaired"] = False
            return True, svg_result, meta, None, 200

        # If SVG validation failed, attempt automatic repair once using repair_svg
        logger.warning(f"Initial SVG validation failed: {val_err}. Triggering automatic repair...")
        repair_success, repaired_svg, repair_meta, repair_err = repair_svg(
            broken_svg=raw_output,
            user_prompt=user_prompt,
            width=width,
            height=height,
            error_details=val_err or "Incomplete or malformed SVG structure",
            client=client,
            model_name=model_name
        )

        if repair_success and repaired_svg:
            total_duration_ms = int((time.time() - start_time) * 1000)
            repair_meta["generation_duration_ms"] = total_duration_ms
            repair_meta["model"] = model_name
            repair_meta["is_repaired"] = True
            return True, repaired_svg, repair_meta, None, 200

        # If repair also failed
        final_err = f"SVG generation produced invalid markup: {val_err}. Automatic repair attempt also failed: {repair_err}"
        return False, None, None, final_err, 422

    except APIError as api_err:
        err_msg = str(api_err)
        logger.error(f"Gemini APIError ({api_err.code}): {err_msg}")

        # Check for 429 quota exhaustion
        if api_err.code == 429 or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
            quota_info = parse_quota_error(err_msg)
            return False, None, None, quota_info["message"], 429

        if api_err.code in (401, 403):
            return False, None, None, f"Gemini API authentication failed ({api_err.code}). Please verify your GEMINI_API_KEY in settings.", 401

        if api_err.code == 404:
            return False, None, None, f"Configured Gemini model '{model_name}' was not found or is unavailable for this key/region.", 404

        return False, None, None, f"Gemini API error ({api_err.code}): {api_err.message or err_msg}", api_err.code or 500

    except Exception as e:
        err_str = str(e)
        logger.exception("Unexpected error in generate_layer_svg")
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            quota_info = parse_quota_error(err_str)
            return False, None, None, quota_info["message"], 429
        return False, None, None, f"Layer generation failed: {err_str}", 500


def repair_svg(
    broken_svg: str,
    user_prompt: str,
    width: int,
    height: int,
    error_details: str,
    client: Optional[genai.Client] = None,
    model_name: Optional[str] = None
) -> Tuple[bool, Optional[str], Dict[str, Any], Optional[str]]:
    """
    Submits incomplete or malformed SVG to Gemini with specific diagnostic error details
    and requests a complete, structurally valid repaired SVG.
    """
    if not client:
        client, client_err = get_genai_client()
        if not client:
            return False, None, {}, client_err or "Client initialization failed"

    model = model_name or get_active_model()

    repair_prompt = f"""You are an expert SVG repair specialist.
An SVG generation attempt produced incomplete or malformed markup with the following validation error:
ERROR: {error_details}

Canvas dimensions: width={width}, height={height}.
Original User Request: {user_prompt}

Incomplete/Malformed Output to repair:
---
{broken_svg[:4000]}
---

REPAIR INSTRUCTIONS:
1. Fix all malformed XML syntax, close any unclosed tags, and ensure the document ends with </svg>.
2. Enforce viewBox="0 0 {width} {height}" and width="{width}" height="{height}".
3. Preserve all valid vector paths and shapes from the snippet.
4. CRITICAL: The repaired SVG must remain a TRANSPARENT OVERLAY — no background fills, no full-image redraw.
5. Output ONLY pure, valid SVG markup. Do NOT wrap in markdown code blocks. No explanations.
"""

    try:
        response = client.models.generate_content(
            model=model,
            contents=[types.Part.from_text(text=repair_prompt)],
            config=types.GenerateContentConfig(temperature=0.1)
        )
        repaired_text = response.text or ""

        # Validate repaired SVG
        valid, final_svg, val_err, meta = prepare_svg_for_layer(
            repaired_text,
            target_width=width,
            target_height=height,
            layer_name="Repaired Layer"
        )
        if valid and final_svg:
            return True, final_svg, meta, None
        return False, None, meta, val_err or "Repaired output is still invalid"

    except Exception as e:
        return False, None, {}, f"SVG repair request failed: {str(e)}"


def list_available_models() -> Dict[str, Any]:
    """Returns list of supported vision models and active selection status."""
    models = [
        {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash (Recommended)", "vision": True, "description": "High-speed multimodal vision model with superior spatial reasoning."},
        {"id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash", "vision": True, "description": "High-accuracy vision model for precise vector layer extraction."},
        {"id": "gemini-flash-latest", "name": "Gemini Flash Latest", "vision": True, "description": "Latest stable Gemini Flash multimodal vision release."},
        {"id": "gemini-pro-latest", "name": "Gemini Pro Latest", "vision": True, "description": "Maximum reasoning capability for intricate artwork details."}
    ]

    active = get_active_model()
    has_key = bool(get_active_api_key())

    return {
        "active_model": active,
        "api_key_configured": has_key,
        "models": models
    }
