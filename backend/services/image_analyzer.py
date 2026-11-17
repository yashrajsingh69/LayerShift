"""
LayerShift - Intelligent Image Understanding & Computer Vision Analysis Service
Analyzes uploaded raster images to extract spatial structure, contour hierarchy,
geometric primitives (circles, straight lines, curves), dominant color palettes,
and semantic categorization WITHOUT hardcoded assumptions.

Detects semantic mismatches between prompt and image (e.g. asking for cat outline on Doraemon)
and adapts intelligently to the actual visible contours.
"""

import cv2
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
import re


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Converts RGB values (0-255) to hex string."""
    return f"#{r:02X}{g:02X}{b:02X}"


def _extract_subject_mask(gray: np.ndarray, is_light_bg: bool, bg_median: float) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
    """
    Extract the main subject as a solid binary mask using foreground segmentation.
    Returns (mask, subject_bounds).
    """
    height, width = gray.shape[:2]

    if is_light_bg:
        # Background is near-white. Foreground = significantly darker pixels.
        # Use adaptive threshold to handle varying stroke darkness
        fg_mask = gray < min(235, bg_median + 20)
    else:
        # Dark background. Foreground = significantly lighter pixels.
        fg_mask = gray > max(30, bg_median - 20)

    fg_mask = fg_mask.astype(np.uint8) * 255

    # Remove small noise
    kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel_small)

    # Close gaps in the subject
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel_close)

    # Find connected components and keep the largest one (main subject)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(fg_mask, connectivity=8)

    if num_labels > 1:
        # Exclude background (label 0), find largest component
        areas = stats[1:, cv2.CC_STAT_AREA]
        largest_idx = np.argmax(areas) + 1  # +1 because we skipped label 0
        subject_mask = (labels == largest_idx).astype(np.uint8) * 255
    else:
        subject_mask = fg_mask

    # Fill holes in the subject mask
    # Flood fill from corners to find background, invert to get solid subject
    h, w = subject_mask.shape
    ff_mask = subject_mask.copy()
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff_mask, flood_mask, (0, 0), 255)
    # Background is what got filled; subject is the inverse within the original bounds
    background_filled = ff_mask == 255
    solid_subject = subject_mask | (~background_filled & (subject_mask == 0)).astype(np.uint8) * 255
    # Simpler: just use the filled version where the subject was
    solid_subject = cv2.bitwise_or(subject_mask, cv2.bitwise_and(cv2.bitwise_not(ff_mask), 255))

    # Ensure we have a valid subject
    if cv2.countNonZero(solid_subject) < 100:
        solid_subject = subject_mask

    # Compute bounding box of solid subject
    points = cv2.findNonZero(solid_subject)
    if points is not None and len(points) > 10:
        bx, by, bw, bh = cv2.boundingRect(points)
    else:
        bx, by, bw, bh = int(width * 0.1), int(height * 0.1), int(width * 0.8), int(height * 0.8)

    min_x, min_y = max(0, bx), max(0, by)
    max_x, max_y = min(width, bx + bw), min(height, by + bh)

    return solid_subject, (min_x, min_y, max_x - min_x, max_y - min_y)


def _compute_external_contour(subject_mask: np.ndarray) -> Optional[np.ndarray]:
    """
    Compute the single external contour of the solid subject mask.
    Returns the largest external contour or None.
    """
    # Find external contours only
    contours, _ = cv2.findContours(subject_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    # Return the largest contour (should be the subject outline)
    return max(contours, key=cv2.contourArea)


def analyze_image_structure(image_bytes: bytes) -> Dict[str, Any]:
    """
    Performs comprehensive computer vision analysis on an uploaded image
    to understand its visual contents and geometry.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"error": "Failed to decode image bytes"}

    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Background Luminance & Contrast
    border_pixels = np.concatenate([gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]])
    bg_median = float(np.median(border_pixels))
    is_light_bg = bg_median > 130

    # 2. Extract solid subject mask using foreground segmentation
    subject_mask, (min_x, min_y, subj_w, subj_h) = _extract_subject_mask(gray, is_light_bg, bg_median)

    max_x = min_x + subj_w
    max_y = min_y + subj_h
    cx = (min_x + max_x) // 2
    cy = (min_y + max_y) // 2

    # 3. External contour of the solid subject (the true silhouette)
    external_contour = _compute_external_contour(subject_mask)
    external_area = cv2.contourArea(external_contour) if external_contour is not None else 0
    external_peri = cv2.arcLength(external_contour, True) if external_contour is not None else 0

    # 4. Contour Topology (using adaptive threshold for detail analysis)
    filtered = cv2.bilateralFilter(gray, 5, 40, 40)
    if is_light_bg:
        contrast = cv2.adaptiveThreshold(
            filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 21, 10
        )
    else:
        _, contrast = cv2.threshold(filtered, 45, 255, cv2.THRESH_BINARY)

    contours, hierarchy = cv2.findContours(contrast, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    total_contours = len(contours)
    valid_contours = [c for c in contours if cv2.contourArea(c) > 150]

    # 5. Geometric Primitives: Hough Circles (Wheels, Eyes, Dials, Bells)
    detected_circles: List[Dict[str, Any]] = []
    blurred = cv2.GaussianBlur(gray, (9, 9), 2)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=int(subj_w * 0.08),
        param1=50, param2=28, minRadius=int(subj_w * 0.025), maxRadius=int(subj_w * 0.35)
    )

    if circles is not None:
        circles_round = np.round(circles[0, :]).astype("int")
        for (ccx, ccy, cr) in circles_round:
            if min_x <= ccx <= max_x and min_y <= ccy <= max_y:
                rel_y = (ccy - min_y) / max(1, subj_h)
                zone = "upper" if rel_y < 0.4 else ("middle" if rel_y < 0.7 else "lower")
                detected_circles.append({
                    "center": (int(ccx), int(ccy)),
                    "radius": int(cr),
                    "zone": zone,
                    "relative_y": round(rel_y, 2)
                })

    # Also detect circular contours via circularity score
    for cnt in valid_contours:
        area = cv2.contourArea(cnt)
        peri = cv2.arcLength(cnt, True)
        if peri > 0:
            circularity = 4 * np.pi * (area / (peri * peri))
            if circularity > 0.65 and 200 < area < (subj_w * subj_h * 0.4):
                (ccx, ccy), cr = cv2.minEnclosingCircle(cnt)
                ccx, ccy, cr = int(ccx), int(ccy), int(cr)
                if not any(abs(c["center"][0] - ccx) < 20 and abs(c["center"][1] - ccy) < 20 for c in detected_circles):
                    rel_y = (ccy - min_y) / max(1, subj_h)
                    zone = "upper" if rel_y < 0.4 else ("middle" if rel_y < 0.7 else "lower")
                    detected_circles.append({
                        "center": (ccx, ccy),
                        "radius": cr,
                        "zone": zone,
                        "relative_y": round(rel_y, 2)
                    })

    # 6. Straight Line Segments via Hough Transform
    edges = cv2.Canny(filtered, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=55, minLineLength=int(subj_w * 0.22), maxLineGap=8)
    h_lines = 0
    v_lines = 0
    d_lines = 0
    if lines is not None:
        for line in lines:
            coords = line.flatten()
            if len(coords) < 4:
                continue
            x1, y1, x2, y2 = int(coords[0]), int(coords[1]), int(coords[2]), int(coords[3])
            dx = abs(x2 - x1)
            dy = abs(y2 - y1)
            if dx > dy * 2:
                h_lines += 1
            elif dy > dx * 2:
                v_lines += 1
            else:
                d_lines += 1

    # 7. Dominant Color Extraction (K-Means on foreground)
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    small_img = cv2.resize(rgb_img, (100, 100), interpolation=cv2.INTER_NEAREST)
    pixels = small_img.reshape(-1, 3).astype(np.float32)
    if is_light_bg:
        fg_pixels = pixels[np.mean(pixels, axis=1) < 235]
        if len(fg_pixels) < 100:
            fg_pixels = pixels
    else:
        fg_pixels = pixels[np.mean(pixels, axis=1) > 30]
        if len(fg_pixels) < 100:
            fg_pixels = pixels

    k = min(4, len(fg_pixels))
    palette: List[str] = []
    if k > 0:
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        _, _, centers = cv2.kmeans(fg_pixels, k, None, criteria, 5, cv2.KMEANS_RANDOM_CENTERS)
        for c in centers:
            r, g, b = int(c[0]), int(c[1]), int(c[2])
            palette.append(rgb_to_hex(r, g, b))

    # 8. Infer Visual Subject Category Heuristically
    detected_category = "sketch_drawing"
    category_confidence = 0.75

    lower_circles = [c for c in detected_circles if c["zone"] == "lower"]
    upper_circles = [c for c in detected_circles if c["zone"] == "upper"]

    # Compute contour complexity using the TRUE external contour
    cnt_complexity = 0.0
    if external_contour is not None and external_area > 0:
        cnt_complexity = external_peri / (external_area ** 0.5)

    # Check camera / product: concentric circles sharing same center in middle
    has_concentric = False
    for i in range(len(detected_circles)):
        for j in range(i + 1, len(detected_circles)):
            c1, c2 = detected_circles[i], detected_circles[j]
            dist = np.hypot(c1["center"][0] - c2["center"][0], c1["center"][1] - c2["center"][1])
            if dist < 18 and abs(c1["radius"] - c2["radius"]) > 15:
                has_concentric = True
                break
        if has_concentric:
            break

    # Check animal sketch first: organic pencil contour with high complexity on light background
    # This should be checked before vehicle to avoid false positives from circle detection
    if cnt_complexity >= 4.5 and is_light_bg:
        detected_category = "animal_sketch"
        category_confidence = 0.86
    # Check vehicle: horizontal aspect ratio >= 1.1, two or more lower circles (wheels) of similar size
    # Vehicle wheels should be roughly same size and at similar vertical position
    elif len(lower_circles) >= 2 and subj_w / max(1, subj_h) >= 1.1:
        # Verify the lower circles are wheel-like: similar radius and aligned horizontally
        wheel_radii = [c["radius"] for c in lower_circles]
        wheel_ys = [c["center"][1] for c in lower_circles]
        radius_ratio = max(wheel_radii) / max(1, min(wheel_radii))
        y_spread = max(wheel_ys) - min(wheel_ys)
        if radius_ratio < 1.8 and y_spread < subj_h * 0.15:
            detected_category = "vehicle"
            category_confidence = 0.92
    # Check camera / product: concentric lens rings
    elif has_concentric and (h_lines + v_lines) >= 4:
        detected_category = "product"
        category_confidence = 0.88
    # Check cartoon / mascot character: round head + round body, multiple circular zones
    elif len(upper_circles) >= 2 and len(valid_contours) >= 1 and cnt_complexity < 6.0:
        detected_category = "cartoon_character"
        category_confidence = 0.88
    # Check architecture: strict rectilinear grid
    elif h_lines >= 4 and v_lines >= 4 and cnt_complexity < 5.5 and not lower_circles:
        detected_category = "architecture"
        category_confidence = 0.88
    # Check logo / emblem: high symmetry, compact bounding box
    elif 0.8 <= (subj_w / max(1, subj_h)) <= 1.2 and len(valid_contours) < 4 and not upper_circles:
        detected_category = "logo"
        category_confidence = 0.80
    # Check human portrait: vertical aspect ratio, upper eye oval, neck/jawline
    elif (subj_h / max(1, subj_w)) >= 1.15 and len(upper_circles) in (1, 2):
        detected_category = "portrait"
        category_confidence = 0.85
    # Check landscape: strong horizontal line in lower half, mountains/sun
    elif h_lines >= 3 and subj_w > subj_h * 1.1 and d_lines >= 10:
        detected_category = "landscape"
        category_confidence = 0.82

    return {
        "width": width,
        "height": height,
        "aspect_ratio": round(width / max(1, height), 2),
        "is_light_bg": is_light_bg,
        "background_median_lum": round(bg_median, 1),
        "subject_bounds": {
            "x": min_x,
            "y": min_y,
            "width": subj_w,
            "height": subj_h,
            "center": (cx, cy)
        },
        "contour_count": total_contours,
        "valid_contours_count": len(valid_contours),
        "external_contour_area": round(external_area, 1),
        "external_contour_perimeter": round(external_peri, 1),
        "external_contour_complexity": round(cnt_complexity, 2),
        "detected_circles": detected_circles,
        "straight_lines": {
            "horizontal": h_lines,
            "vertical": v_lines,
            "diagonal": d_lines
        },
        "dominant_palette": palette,
        "inferred_category": detected_category,
        "category_confidence": round(category_confidence, 2)
    }


def _word_in_prompt(word: str, prompt: str) -> bool:
    """Check if a whole word appears in the prompt (case-insensitive)."""
    pattern = r'\b' + re.escape(word) + r'\b'
    return bool(re.search(pattern, prompt, re.IGNORECASE))


def reconcile_prompt_with_image(
    image_analysis: Dict[str, Any],
    raw_prompt: str,
    parsed_target: str,
    parsed_region: str
) -> Dict[str, Any]:
    """
    Intelligently identifies semantic mismatches and adapts vector targeting.
    Example: If user asks for "cat outline" on Doraemon, recognizes the visual mascot
    and targets the character's real contour instead of failing or forcing cat geometry.
    """
    p_lower = raw_prompt.lower()
    inferred_cat = image_analysis.get("inferred_category", "object")
    subject_bounds = image_analysis.get("subject_bounds", {})
    detected_circles = image_analysis.get("detected_circles", [])

    mismatch = False
    adaptation_note = ""
    effective_region = parsed_region
    confidence = image_analysis.get("category_confidence", 0.8)

    # 1. Animal / Cat prompt on Non-Animal Image
    if (_word_in_prompt("cat", p_lower) or _word_in_prompt("feline", p_lower)) and inferred_cat in ("vehicle", "architecture", "cartoon_character", "product", "landscape", "logo"):
        mismatch = True
        if inferred_cat == "cartoon_character":
            adaptation_note = f"Uploaded image is a cartoon mascot/character. Adapting targeting to the visible character."
            effective_region = parsed_region
        elif inferred_cat == "vehicle":
            adaptation_note = f"Uploaded image is a vehicle/car. Adapting request to the car's body silhouette."
            effective_region = "full_silhouette"
        elif inferred_cat == "architecture":
            adaptation_note = f"Uploaded image is an architectural structure. Adapting request to building facade & roofline."
            effective_region = "full_silhouette"
        else:
            adaptation_note = f"Adapting outline instruction to the primary visible {inferred_cat} silhouette."
            effective_region = "full_silhouette"

    # 2. Vehicle-specific parts requested (wheels, windows, headlights, windshield)
    # Use word-boundary checks to avoid false matches like "tire" in "entire"
    elif _word_in_prompt("wheel", p_lower) or _word_in_prompt("wheels", p_lower) or _word_in_prompt("tire", p_lower) or _word_in_prompt("tires", p_lower):
        effective_region = "wheels"
        if inferred_cat != "vehicle" and not any(c["zone"] == "lower" for c in detected_circles):
            mismatch = True
            adaptation_note = "Requested wheels, but no lower circular components detected. Scanning for nearest radial components."
        else:
            adaptation_note = "Targeting detected wheel contours in vehicle lower zone."

    elif _word_in_prompt("window", p_lower) or _word_in_prompt("windows", p_lower) or _word_in_prompt("glass", p_lower) or _word_in_prompt("windshield", p_lower):
        effective_region = "windows"
        adaptation_note = "Targeting architectural or vehicular window frames."

    elif _word_in_prompt("roof", p_lower) or _word_in_prompt("roofline", p_lower) or _word_in_prompt("ceiling", p_lower) or _word_in_prompt("gable", p_lower):
        effective_region = "roof"
        adaptation_note = "Targeting upper structural roofline and contours."

    elif _word_in_prompt("door", p_lower) or _word_in_prompt("doors", p_lower) or _word_in_prompt("entry", p_lower) or _word_in_prompt("entrance", p_lower):
        effective_region = "doors"
        adaptation_note = "Targeting central entryway/door geometry."

    elif _word_in_prompt("hair", p_lower) or _word_in_prompt("hairstyle", p_lower) or _word_in_prompt("bangs", p_lower) or _word_in_prompt("locks", p_lower):
        effective_region = "hair"
        adaptation_note = "Targeting upper portrait hair volume."

    elif _word_in_prompt("clothing", p_lower) or _word_in_prompt("jacket", p_lower) or _word_in_prompt("shirt", p_lower) or _word_in_prompt("collar", p_lower) or _word_in_prompt("suit", p_lower) or _word_in_prompt("dress", p_lower):
        effective_region = "clothing"
        adaptation_note = "Targeting lower attire / clothing region."

    elif _word_in_prompt("mountain", p_lower) or _word_in_prompt("mountains", p_lower) or _word_in_prompt("ridge", p_lower) or _word_in_prompt("peaks", p_lower) or _word_in_prompt("peak", p_lower):
        effective_region = "mountains"
        adaptation_note = "Targeting landscape mountain ridges."

    elif _word_in_prompt("sun", p_lower) or _word_in_prompt("moon", p_lower) or _word_in_prompt("star", p_lower) or _word_in_prompt("badge", p_lower) or _word_in_prompt("emblem", p_lower):
        effective_region = "circular_emblem"
        adaptation_note = "Targeting celestial or emblem focal geometry."

    elif _word_in_prompt("line", p_lower) and _word_in_prompt("art", p_lower):
        effective_region = "complete_line_art"
        adaptation_note = "Vectorizing entire artwork contour network."

    return {
        "mismatch_detected": mismatch,
        "inferred_category": inferred_cat,
        "original_target_region": parsed_region,
        "effective_target_region": effective_region,
        "adaptation_note": adaptation_note,
        "confidence": confidence
    }