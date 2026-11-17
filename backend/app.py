"""
LayerShift Backend - Master REST API Server
Provides endpoints for AI layer generation, SVG validation, repair, and configuration.
"""

import os
import sys
import json
import time
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Ensure backend root directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

FRONTEND_DIST = os.path.join(os.path.dirname(CURRENT_DIR), "frontend", "dist")


# Load environment variables
load_dotenv(os.path.join(CURRENT_DIR, ".env"))

from utils.validation import validate_image_file, MAX_FILE_SIZE_BYTES
from services.image_service import process_uploaded_image
from services.svg_service import prepare_svg_for_layer, format_export_svg
from services.vector_engine import generate_local_vector_layer
from services.hybrid_vector_engine import generate_hybrid_vector_layer
from services.image_analyzer import analyze_image_structure, reconcile_prompt_with_image
from services.gemini_service import (
    generate_layer_svg,
    repair_svg,
    list_available_models,
    set_runtime_api_key,
    set_runtime_model,
    get_active_api_key,
    get_active_model,
    test_gemini_connection
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("layershift")

# Initialize Flask app
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE_BYTES

# Enable CORS for frontend development
CORS(app, resources={r"/api/*": {"origins": "*"}})


@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({
        "success": False,
        "error": f"Uploaded file is too large. Maximum allowed size is {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB."
    }), 413


@app.errorhandler(400)
def bad_request(error):
    return jsonify({
        "success": False,
        "error": getattr(error, 'description', "Bad request parameters.")
    }), 400


@app.errorhandler(500)
def internal_server_error(error):
    return jsonify({
        "success": False,
        "error": "Internal server processing error. Please check server logs."
    }), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health status and Gemini configuration check."""
    has_key = bool(get_active_api_key())
    active_model = get_active_model()
    return jsonify({
        "status": "healthy",
        "service": "LayerShift AI Vision Vector Engine",
        "gemini_configured": has_key,
        "selected_model": active_model,
        "timestamp": time.time()
    }), 200


@app.route("/api/models", methods=["GET"])
def get_models():
    """Returns supported vision models and active state."""
    data = list_available_models()
    return jsonify(data), 200


@app.route("/api/test-key", methods=["POST"])
def test_key():
    """Tests whether the specified or configured Gemini API key is valid and responsive."""
    data = request.get_json(silent=True) or {}
    api_key = data.get("api_key", "").strip()
    model = data.get("model", "").strip()

    success, message, active_model = test_gemini_connection(
        api_key=api_key if api_key else None,
        model_name=model if model else None
    )
    return jsonify({
        "success": success,
        "message": message,
        "model": active_model or get_active_model()
    }), 200


@app.route("/api/config-key", methods=["POST"])
def config_api_key():
    """Sets or tests API key dynamically from frontend settings and persists to .env."""
    data = request.get_json(silent=True) or {}
    api_key = data.get("api_key", "").strip()
    model = data.get("model", "").strip()

    if api_key:
        set_runtime_api_key(api_key)
        # Persist to backend/.env file
        env_path = os.path.join(CURRENT_DIR, ".env")
        try:
            env_lines = []
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    env_lines = f.readlines()
            new_lines = []
            found_key = False
            found_model = False
            for line in env_lines:
                if line.startswith("GEMINI_API_KEY="):
                    new_lines.append(f"GEMINI_API_KEY={api_key}\n")
                    found_key = True
                elif model and line.startswith("GEMINI_MODEL="):
                    new_lines.append(f"GEMINI_MODEL={model}\n")
                    found_model = True
                else:
                    new_lines.append(line)
            if not found_key:
                new_lines.append(f"GEMINI_API_KEY={api_key}\n")
            if model and not found_model:
                new_lines.append(f"GEMINI_MODEL={model}\n")
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
            logger.info("Successfully persisted Gemini configuration to backend/.env")
        except Exception as e:
            logger.warning(f"Could not persist key to .env: {e}")

    if model:
        set_runtime_model(model)

    has_key = bool(get_active_api_key())
    active_model = get_active_model()

    return jsonify({
        "success": True,
        "gemini_configured": has_key,
        "selected_model": active_model,
        "message": "Configuration updated and saved successfully."
    }), 200


@app.route("/api/generate-layer", methods=["POST"])
def generate_layer():
    """
    Precision AI & CV vector layer generation endpoint.
    Accepts BOTH:
      1. Multipart FormData ('image' file, 'prompt' string, 'settings' JSON string)
      2. JSON payload ({ 'image': base64/dataURL, 'prompt': string, 'settings'/'mode': ... })
    Supports generationMode: 'quick' (<50ms), 'precise' (default), 'advanced'.
    """
    json_data = request.get_json(silent=True)

    if json_data and ("image" in json_data or "image_data" in json_data):
        # Handle JSON Base64 Payload (compatible with monolithic App.jsx)
        raw_b64 = json_data.get("image") or json_data.get("image_data") or ""
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",")[1]
        try:
            import base64
            image_bytes = base64.b64decode(raw_b64)
        except Exception as e:
            return jsonify({"success": False, "error": f"Invalid base64 image: {str(e)}"}), 400

        prompt = (json_data.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"success": False, "error": "Prompt cannot be empty. Please describe what layer to generate."}), 400

        mime_type = json_data.get("mime_type", "image/png")
        width = int(json_data.get("width", 800))
        height = int(json_data.get("height", 800))
        settings = json_data.get("settings", {})
        if isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                settings = {}
        if "generationMode" not in settings and "mode" in json_data:
            settings["generationMode"] = json_data["mode"]

        metadata = {"filename": "uploaded_sketch.png", "width": width, "height": height}

    elif 'image' in request.files:
        # Handle Multipart/form-data Payload
        image_file = request.files['image']
        valid, img_err, img_meta = validate_image_file(image_file)
        if not valid:
            return jsonify({"success": False, "error": img_err}), 400

        prompt = request.form.get("prompt", "").strip()
        if not prompt:
            return jsonify({"success": False, "error": "Prompt cannot be empty. Please describe what layer to generate."}), 400

        settings_raw = request.form.get("settings")
        settings = {}
        if settings_raw:
            try:
                settings = json.loads(settings_raw)
            except Exception:
                pass

        image_bytes, mime_type, width, height, metadata = process_uploaded_image(image_file)

    else:
        return jsonify({"success": False, "error": "No image file provided. Send multipart 'image' file or JSON with base64 'image'."}), 400

    logger.info(f"Generating layer for: {metadata['filename']} ({width}x{height}) | Mode: {settings.get('generationMode', 'precise')} | Prompt: '{prompt}'")

    # Generate vector layer using hybrid synthesis engine
    success, svg_markup, layer_meta, err_msg, status_code, timing = generate_hybrid_vector_layer(
        image_bytes=image_bytes,
        mime_type=mime_type,
        user_prompt=prompt,
        width=width,
        height=height,
        settings=settings
    )

    if not success or not svg_markup:
        return jsonify({
            "success": False,
            "error": err_msg or "Failed to generate valid vector layer."
        }), status_code or 500

    # Format standalone SVG for export
    formatted_svg = format_export_svg(svg_markup, layer_name=settings.get("layerName", "Generated Layer"))

    return jsonify({
        "success": True,
        "svg": svg_markup,
        "export_svg": formatted_svg,
        "metadata": layer_meta,
        "canvas": {
            "width": width,
            "height": height,
            "aspect_ratio": round(width / height, 4) if height > 0 else 1.0
        },
        "duration_ms": timing.get("total_ms", 0),
        "timing": timing,
        "is_repaired": layer_meta.get("is_repaired", False)
    }), 200


@app.route("/api/repair-svg", methods=["POST"])
def repair_svg_endpoint():
    """Manual repair endpoint for incomplete or malformed SVG."""
    data = request.get_json(silent=True) or {}
    broken_svg = data.get("svg", "").strip()
    user_prompt = data.get("prompt", "Repair SVG layer").strip()
    width = int(data.get("width", 1024))
    height = int(data.get("height", 1024))
    error_details = data.get("error_details", "Incomplete or malformed markup")

    if not broken_svg:
        return jsonify({"success": False, "error": "No SVG string provided for repair."}), 400

    success, repaired_svg, meta, err = repair_svg(
        broken_svg=broken_svg,
        user_prompt=user_prompt,
        width=width,
        height=height,
        error_details=error_details
    )

    if not success or not repaired_svg:
        return jsonify({
            "success": False,
            "error": err or "Failed to repair SVG."
        }), 422

    return jsonify({
        "success": True,
        "svg": repaired_svg,
        "metadata": meta
    }), 200


@app.route("/api/analyze-image", methods=["POST"])
def analyze_image():
    """
    Performs high-speed (<15ms) Computer Vision analysis of uploaded image:
    subject boundaries, contour counts, geometric primitives, dominant palette,
    and category heuristics.
    """
    json_data = request.get_json(silent=True)
    if json_data and ("image" in json_data or "image_data" in json_data):
        raw_b64 = json_data.get("image") or json_data.get("image_data") or ""
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",")[1]
        try:
            import base64
            image_bytes = base64.b64decode(raw_b64)
        except Exception as e:
            return jsonify({"success": False, "error": f"Invalid base64: {e}"}), 400
    elif "image" in request.files:
        image_bytes = request.files["image"].read()
    else:
        return jsonify({"success": False, "error": "No image provided"}), 400

    analysis = analyze_image_structure(image_bytes)
    return jsonify({"success": True, "analysis": analysis}), 200


@app.route("/api/sample-file/<filename>", methods=["GET"])
def get_sample_file(filename):
    """Serves sample image files directly from backend/samples."""
    samples_dir = os.path.join(CURRENT_DIR, "samples")
    return send_from_directory(samples_dir, filename)


@app.route("/api/sample-images", methods=["GET"])
def get_sample_images():
    """Provides curated sample sketches across 8 universal categories."""
    samples = [
        {
            "id": "sample-animal-cat",
            "name": "Pencil Sketch: Sitting Cat",
            "category": "Animals & Wildlife",
            "filename": "cat_sketch.png",
            "suggested_prompt": "Add a clean gold outline around only the cat's outer body silhouette. Do not modify facial features.",
            "test_prompts": [
                "Add a clean gold outline around only the cat's outer body silhouette. Do not modify facial features.",
                "Create a separate vector layer containing only the cat's eyes.",
                "Extract only the whiskers into a separate editable SVG layer.",
                "Create a clean black outline of the cat's complete silhouette."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/cat_sketch.png"
        },
        {
            "id": "sample-cartoon-character",
            "name": "Cartoon Mascot: Anime Character",
            "category": "Characters & Cartoons",
            "filename": "cartoon_character.png",
            "suggested_prompt": "Extract the character outline as a separate vector layer with cyan stroke.",
            "test_prompts": [
                "Extract the character outline as a separate vector layer with cyan stroke.",
                "Create a separate vector layer containing only the eyes and nose.",
                "Extract the collar, bell, and pocket into an editable layer.",
                "Convert the complete character into clean vector line art."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/cartoon_character.png"
        },
        {
            "id": "sample-human-portrait",
            "name": "Portrait Sketch: Hair & Glasses",
            "category": "Human Portraits",
            "filename": "human_portrait.png",
            "suggested_prompt": "Extract hair into a separate vector layer with rich violet stroke.",
            "test_prompts": [
                "Extract hair into a separate vector layer with rich violet stroke.",
                "Extract the glasses and eyes into an editable vector layer.",
                "Create a clean line-art layer of the jawline and neck collar.",
                "Create a clean outline of the entire portrait silhouette."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/human_portrait.png"
        },
        {
            "id": "sample-car-drawing",
            "name": "Sports Car: Body & Wheels",
            "category": "Vehicles & Transport",
            "filename": "car_drawing.png",
            "suggested_prompt": "Extract the wheels and tires into a separate editable vector layer.",
            "test_prompts": [
                "Extract the wheels and tires into a separate editable vector layer.",
                "Create a clean electric lime outline of the car body silhouette.",
                "Extract the windshield and window frames into a vector layer.",
                "Separate the car into body, wheels, and windows layers."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/car_drawing.png"
        },
        {
            "id": "sample-building-architecture",
            "name": "Modern Architectural Facade",
            "category": "Architecture & Buildings",
            "filename": "building_architecture.png",
            "suggested_prompt": "Extract the gable roofline and structural facade into a vector layer.",
            "test_prompts": [
                "Extract the gable roofline and structural facade into a vector layer.",
                "Extract the window frames and front entrance door.",
                "Create a clean line-art trace of the entire building structure.",
                "Add an electric lime outline along the building silhouette."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/building_architecture.png"
        },
        {
            "id": "sample-product-sketch",
            "name": "Designer Camera & Optics",
            "category": "Product Design",
            "filename": "product_sketch.png",
            "suggested_prompt": "Trace the concentric camera lens rings into clean circular vector paths.",
            "test_prompts": [
                "Trace the concentric camera lens rings into clean circular vector paths.",
                "Extract the camera body chassis and top dials into a vector layer.",
                "Convert the product sketch into precision technical line art.",
                "Create an electric lime outline of the camera silhouette."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/product_sketch.png"
        },
        {
            "id": "sample-logo-emblem",
            "name": "Geometric Shield & Star Emblem",
            "category": "Logos & Emblems",
            "filename": "logo_emblem.png",
            "suggested_prompt": "Extract the center star and inner shield into an editable vector layer.",
            "test_prompts": [
                "Extract the center star and inner shield into an editable vector layer.",
                "Trace the outer shield boundary into a clean gold vector contour.",
                "Convert the complete logo emblem into crisp vector shapes.",
                "Separate the emblem into shield contour and star layers."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/logo_emblem.png"
        },
        {
            "id": "sample-landscape-scenery",
            "name": "Mountain Range, Lake & Sun",
            "category": "Landscapes & Nature",
            "filename": "landscape_scenery.png",
            "suggested_prompt": "Extract the mountain ridges and rising sun into separate vector layers.",
            "test_prompts": [
                "Extract the mountain ridges and rising sun into separate vector layers.",
                "Extract only the mountain silhouette across the horizon.",
                "Trace the pine trees and lake water into an organic vector layer.",
                "Create a minimalist line art illustration of the landscape."
            ],
            "width": 800,
            "height": 800,
            "type": "file",
            "url": "/api/sample-file/landscape_scenery.png"
        }
    ]
    return jsonify({"success": True, "samples": samples}), 200


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """Serves compiled frontend assets or index.html for client-side routing."""
    if path.startswith("api/"):
        return jsonify({"error": "Endpoint not found"}), 404
    file_path = os.path.join(FRONTEND_DIST, path)
    if path and os.path.isfile(file_path):
        return send_from_directory(FRONTEND_DIST, path)
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({
        "service": "LayerShift AI Vision Vector Engine",
        "status": "healthy",
        "message": "Frontend static bundle not found. Please run 'npm run build' in frontend/ directory."
    }), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "127.0.0.1")
    debug = os.environ.get("DEBUG", "False").lower() in ("true", "1")
    logger.info(f"Starting LayerShift Backend on http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)
