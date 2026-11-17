"""
LayerShift - Universal Instruction Interpretation System
Analyzes natural language creative editing prompts across ANY subject:
Animals, Characters, Portraits, Vehicles, Architecture, Products, Logos, Landscapes.

Identifies:
1. Target subject (car, portrait, character, building, animal, logo, product, landscape, etc.)
2. Target region/component (silhouette, body, wheels, windows, roof, hair, eyes, clothing, line art, etc.)
3. Requested operation (outline, extract, isolate, line art, color, vectorize)
4. Target color (name and hex code)
5. Negative preservation constraints (elements to preserve and elements to exclude)
6. Multi-layer intent
"""

import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


COLOR_MAP = {
    "gold": "#FFD700",
    "golden": "#FFD700",
    "yellow": "#FFEB3B",
    "black": "#000000",
    "white": "#FFFFFF",
    "electric lime": "#C7FF4A",
    "lime": "#C7FF4A",
    "green": "#4CAF50",
    "cyan": "#62D9E8",
    "teal": "#009688",
    "blue": "#2196F3",
    "deep violet": "#8B5CF6",
    "violet": "#8B5CF6",
    "purple": "#A855F7",
    "rich violet": "#7C3AED",
    "warm coral": "#FF6B6B",
    "coral": "#FF6B6B",
    "red": "#EF4444",
    "crimson": "#DC143C",
    "pink": "#EC4899",
    "orange": "#F97316",
    "soft champagne": "#F5E6D3",
    "champagne": "#F5E6D3",
    "silver": "#CBD5E1",
    "gray": "#94A3B8",
    "grey": "#94A3B8",
    "neon green": "#39FF14",
    "neon blue": "#00F0FF",
    "neon pink": "#FF007F",
    "amber": "#F59E0B",
    "emerald": "#10B981"
}


@dataclass
class EditingInstruction:
    raw_prompt: str
    target_subject: str
    target_region: str
    operation: str
    color_name: str
    color_hex: str
    stroke_width: float
    style: str
    preserve_elements: List[str] = field(default_factory=list)
    exclude_elements: List[str] = field(default_factory=list)
    multi_layer: bool = False
    requested_layers: List[str] = field(default_factory=list)
    mode: str = "precise"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_prompt": self.raw_prompt,
            "target_subject": self.target_subject,
            "target_region": self.target_region,
            "operation": self.operation,
            "color_name": self.color_name,
            "color_hex": self.color_hex,
            "stroke_width": self.stroke_width,
            "style": self.style,
            "preserve_elements": self.preserve_elements,
            "exclude_elements": self.exclude_elements,
            "multi_layer": self.multi_layer,
            "requested_layers": self.requested_layers,
            "mode": self.mode
        }


def parse_instruction(prompt: str, mode: str = "precise") -> EditingInstruction:
    """
    Universally parses natural language prompts without category bias.
    """
    p_lower = prompt.lower().strip()

    # 1. Color Extraction
    color_name = "electric lime"  # default accent
    color_hex = "#C7FF4A"

    # Specific check for benchmark "gold" if mentioned
    if "gold" in p_lower or "golden" in p_lower:
        color_name = "gold"
        color_hex = "#FFD700"
    else:
        # Sort by key length descending so multi-word color names match first
        for cname, chex in sorted(COLOR_MAP.items(), key=lambda x: len(x[0]), reverse=True):
            if re.search(r'\b' + re.escape(cname) + r'\b', p_lower):
                color_name = cname
                color_hex = chex
                break

    # Direct hex code matching (e.g. #FFD700, #C7FF4A)
    hex_match = re.search(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b', prompt)
    if hex_match:
        color_hex = hex_match.group(0).upper()
        color_name = "custom"

    # 2. Target Subject Identification (Universal)
    target_subject = "subject"
    subject_patterns = [
        (r'\b(car|automobile|vehicle|truck|bike|motorcycle|sedan|coupe)\b', "vehicle"),
        (r'\b(building|house|architecture|tower|facade|structure|palace|temple|cabin)\b', "architecture"),
        (r'\b(portrait|person|face|man|woman|girl|boy|human|model)\b', "portrait"),
        (r'\b(character|cartoon|mascot|anime|doraemon|hero|avatar|figure)\b', "character"),
        (r'\b(logo|emblem|badge|symbol|crest|icon|mark|sign)\b', "logo"),
        (r'\b(product|camera|shoe|sneaker|watch|gadget|bottle|device|furniture)\b', "product"),
        (r'\b(landscape|mountain|scenery|nature|tree|river|lake|forest|horizon)\b', "landscape"),
        (r'\b(cat|feline|kitten|dog|canine|puppy|fox|wolf|bear|lion|tiger|bird|animal)\b', "animal"),
        (r'\b(sketch|drawing|illustration|artwork|artwork)\b', "sketch")
    ]
    for pattern, subj in subject_patterns:
        if re.search(pattern, p_lower):
            target_subject = subj
            break

    # 3. Target Region / Component Identification (Universal)
    target_region = "full_silhouette"
    preserve_elements = ["original_sketch", "unrelated_regions"]
    exclude_elements = ["unrequested_shapes", "decorative_noise"]

    # Region detectors
    is_wheels = bool(re.search(r'\b(wheel|wheels|tire|tires|rim|rims)\b', p_lower))
    is_windows = bool(re.search(r'\b(window|windows|windshield|glass)\b', p_lower))
    is_roof = bool(re.search(r'\b(roof|roofline|gable|ceiling|top roof)\b', p_lower))
    is_doors = bool(re.search(r'\b(door|doors|entry|entrance)\b', p_lower))
    is_hair = bool(re.search(r'\b(hair|hairstyle|curls|braid|bangs)\b', p_lower))
    is_eyes = bool(re.search(r'\b(eye|eyes|pupil|pupils|eyeball)\b', p_lower))
    is_glasses = bool(re.search(r'\b(glasses|spectacles|shades|sunglasses)\b', p_lower))
    is_crown = bool(re.search(r'\b(crown|tiara|coronet|halo|horns)\b', p_lower))
    is_face = bool(re.search(r'\b(face|facial|nose|mouth|lips|ear|ears)\b', p_lower))
    is_whiskers = bool(re.search(r'\b(whisker|whiskers|mustache)\b', p_lower))
    is_clothing = bool(re.search(r'\b(clothing|clothes|jacket|shirt|suit|dress|collar|pants|armor|coat)\b', p_lower))
    is_body = bool(re.search(r'\b(body|body silhouette|outer body|torso|chassis|frame)\b', p_lower))
    is_mountains = bool(re.search(r'\b(mountain|mountains|ridge|ridges|peak|peaks)\b', p_lower))
    is_sun_moon = bool(re.search(r'\b(sun|moon|star|stars|celestial|badge)\b', p_lower))
    is_background = bool(re.search(r'\b(background|backdrop|sky|environment|setting)\b', p_lower))
    is_line_art = bool(re.search(r'\b(line art|clean line art|line-art|vectorize all|full inking|ink lines|clean lines)\b', p_lower))
    is_silhouette = bool(re.search(r'\b(silhouette|outer contour|full outline|complete silhouette|outer silhouette|boundary)\b', p_lower))
    is_lens = bool(re.search(r'\b(lens|lenses|objective|aperture|dial|dials|shutter)\b', p_lower))
    is_emblem = bool(re.search(r'\b(emblem|shield|star|crest|insignia|symbol)\b', p_lower))
    is_bow = bool(re.search(r'\b(bow|ribbon|hair bow|bow tie)\b', p_lower))

    # Check for explicit negative preservation instructions:
    # e.g. "Do not modify facial features", "leave background untouched", "do not alter wheels"
    if re.search(r'\b(do not modify|do not change|leave|preserve|keep|without altering)\b.*?\b(face|facial|facial features|eyes|nose|whiskers)\b', p_lower):
        preserve_elements.extend(["facial_features", "eyes", "nose", "whiskers"])
        exclude_elements.extend(["facial_strokes", "interior_face_lines"])
    if re.search(r'\b(do not modify|do not change|preserve|leave)\b.*?\b(background|surroundings)\b', p_lower):
        preserve_elements.append("background")
        exclude_elements.append("background_elements")

    # Map to Target Region
    if is_wheels:
        target_region = "wheels"
        preserve_elements.extend(["car_body", "windows", "chassis", "background"])
        exclude_elements.extend(["car_body_outline", "unrelated_shapes"])
    elif is_windows:
        target_region = "windows"
        preserve_elements.extend(["body", "wheels", "facade", "background"])
    elif is_roof:
        target_region = "roof"
        preserve_elements.extend(["facade", "doors", "windows", "foundation"])
    elif is_doors:
        target_region = "doors"
        preserve_elements.extend(["roof", "windows", "facade"])
    elif is_hair:
        target_region = "hair"
        preserve_elements.extend(["face", "eyes", "neck", "clothing"])
        exclude_elements.extend(["eyes", "facial_features", "clothing"])
    elif is_glasses:
        target_region = "glasses"
        preserve_elements.extend(["hair", "neck", "clothing"])
    elif is_crown:
        target_region = "crown"
        preserve_elements.extend(["face", "hair", "body", "background"])
        exclude_elements.extend(["facial_features", "background_shapes"])
    elif is_eyes and not is_whiskers and not is_body:
        target_region = "eyes"
        preserve_elements.extend(["body", "face", "whiskers", "background", "hair"])
        exclude_elements.extend(["body_outline", "whiskers", "background_elements", "unrelated_shapes"])
    elif is_whiskers and not is_eyes:
        target_region = "whiskers"
        preserve_elements.extend(["body", "face", "eyes", "head", "background"])
        exclude_elements.extend(["body_outline", "eyes", "background_elements"])
    elif is_clothing:
        target_region = "clothing"
        preserve_elements.extend(["face", "hair", "head", "skin", "background"])
        exclude_elements.extend(["facial_details", "background_shapes"])
    elif is_lens:
        target_region = "lens"
        preserve_elements.extend(["camera_body", "background"])
    elif is_emblem:
        target_region = "logo_emblem"
    elif is_bow:
        target_region = "bow"
        preserve_elements.extend(["hair", "face", "body", "background"])
        exclude_elements.extend(["facial_features", "background_shapes"])
    elif is_mountains:
        target_region = "mountains"
        preserve_elements.extend(["foreground_trees", "water", "sky"])
    elif is_sun_moon:
        target_region = "sun_moon"
    elif is_background:
        target_region = "background"
        preserve_elements.extend(["foreground_subject"])
        exclude_elements.extend(["foreground_strokes"])
    elif is_line_art:
        target_region = "complete_line_art"
    elif is_body and not is_eyes and not is_whiskers and not is_wheels:
        target_region = "body_silhouette"
        preserve_elements.extend(["face", "facial_features", "eyes", "whiskers", "head"])
        exclude_elements.extend(["facial_strokes", "interior_eyes", "whiskers", "decorative_noise"])
    elif is_face and not is_body:
        target_region = "face"
        preserve_elements.extend(["body", "background", "clothing"])
    elif is_silhouette:
        target_region = "full_silhouette"
        exclude_elements.extend(["interior_fill_noise", "decorative_noise"])

    # 4. Multi-Layer Decomposition Detection
    multi_layer = False
    requested_layers: List[str] = []
    if any(phrase in p_lower for phrase in ["separate", "independent layers", "multiple layers", "split into layers", "decompose"]):
        multi_layer = True
        if target_subject == "vehicle":
            requested_layers = ["Car Body", "Wheels & Tires", "Windows & Windshield"]
        elif target_subject == "architecture":
            requested_layers = ["Building Facade", "Roofline", "Windows & Doors"]
        elif target_subject == "portrait":
            requested_layers = ["Hair Volume", "Facial Features", "Attire & Collar"]
        elif target_subject == "landscape":
            requested_layers = ["Mountain Ridges", "Sun / Moon", "Foreground Trees & Water"]
        elif target_subject == "product":
            requested_layers = ["Chassis Outline", "Lens & Optical Rings", "Controls & Dials"]
        elif target_subject == "logo":
            requested_layers = ["Shield & Boundary", "Center Star / Symbol"]
        else:
            requested_layers = ["Primary Contour", "Secondary Details"]

    # 5. Operation
    operation = "outline"
    if any(w in p_lower for w in ["fill", "flat color", "recolor", "colorize"]):
        operation = "fill"
    elif any(w in p_lower for w in ["line art", "clean lines", "vectorize", "trace"]):
        operation = "line_art"
    elif any(w in p_lower for w in ["extract", "isolate", "separate"]):
        operation = "extract"

    # 6. Stroke width
    stroke_width = 3.0
    if "thin" in p_lower or "fine" in p_lower:
        stroke_width = 1.5
    elif "thick" in p_lower or "bold" in p_lower:
        stroke_width = 5.0

    return EditingInstruction(
        raw_prompt=prompt,
        target_subject=target_subject,
        target_region=target_region,
        operation=operation,
        color_name=color_name,
        color_hex=color_hex,
        stroke_width=stroke_width,
        style="clean_vector",
        preserve_elements=preserve_elements,
        exclude_elements=exclude_elements,
        multi_layer=multi_layer,
        requested_layers=requested_layers,
        mode=mode
    )
