"""
LayerShift - Validation & Security Utilities
Handles image file validation, SVG extraction, XML parsing, and security sanitization.
"""

import re
import io
import xml.etree.ElementTree as ET
from typing import Tuple, Optional, Dict, Any, List
from PIL import Image

# Register default SVG namespaces so serialized output uses clean <svg>, <circle>, etc. instead of ns0:
ET.register_namespace('', 'http://www.w3.org/2000/svg')
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')


# Allowed MIME types and extensions
ALLOWED_MIME_TYPES = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_IMAGE_DIMENSION = 8192  # 8k max
MIN_IMAGE_DIMENSION = 32

# Unsafe SVG tags that must be stripped or rejected
DISALLOWED_SVG_TAGS = {
    'script', 'iframe', 'object', 'embed', 'applet', 'meta', 'link',
    'frame', 'frameset', 'form', 'input', 'button', 'textarea'
}

# Regex to catch inline JS in attributes: onload, onclick, onmouseover, etc.
EVENT_HANDLER_REGEX = re.compile(r'^on[a-z]+$', re.IGNORECASE)

# Regex to catch javascript: or vbscript: or data:text/html URIs
DANGEROUS_URI_REGEX = re.compile(r'^\s*(javascript:|vbscript:|data:text/html)', re.IGNORECASE)


def validate_image_file(file_storage) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validates uploaded image file from Flask request.files.
    Ensures file exists, is non-empty, matches allowed MIME types,
    and is a valid readable image via Pillow.
    """
    if file_storage is None:
        return False, "No image file provided in request", None
    
    filename = getattr(file_storage, 'filename', '')
    if not filename:
        return False, "Empty or invalid filename", None

    content_type = getattr(file_storage, 'content_type', '').lower()
    # Check MIME type
    if content_type not in ALLOWED_MIME_TYPES:
        # Fallback check by filename extension
        ext = '.' + filename.split('.')[-1].lower() if '.' in filename else ''
        if ext not in ['.png', '.jpg', '.jpeg', '.webp']:
            return False, f"Unsupported file type '{content_type or ext}'. Supported formats: PNG, JPG, JPEG, WEBP", None

    # Read binary stream to inspect size and headers
    stream = file_storage.stream
    stream.seek(0, io.SEEK_END)
    size = stream.tell()
    stream.seek(0)

    if size == 0:
        return False, "Uploaded file is empty (0 bytes)", None

    if size > MAX_FILE_SIZE_BYTES:
        return False, f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB", None

    # Handle SVG files safely
    if content_type == 'image/svg+xml' or filename.lower().endswith('.svg'):
        try:
            raw_bytes = stream.read()
            stream.seek(0)
            clean_xml = re.sub(r'<\?xml[^>]*\?>', '', raw_bytes.decode('utf-8', errors='ignore')).strip()
            root = ET.fromstring(clean_xml)
            viewbox = root.attrib.get('viewBox', '')
            width, height = 800, 800
            if viewbox:
                parts = viewbox.split()
                if len(parts) >= 4:
                    width = int(float(parts[2]))
                    height = int(float(parts[3]))
            elif 'width' in root.attrib and 'height' in root.attrib:
                try:
                    width = int(float(root.attrib['width'].replace('px', '')))
                    height = int(float(root.attrib['height'].replace('px', '')))
                except Exception:
                    pass

            metadata = {
                'filename': filename,
                'content_type': 'image/svg+xml',
                'format': 'SVG',
                'width': width,
                'height': height,
                'aspect_ratio': round(width / height, 4) if height > 0 else 1.0,
                'size_bytes': size
            }
            return True, None, metadata
        except Exception as e:
            return False, f"Invalid or corrupted SVG file: {str(e)}", None

    # Pillow deep inspection for raster formats (PNG, JPG, WEBP)
    try:
        raw_bytes = stream.read()
        stream.seek(0)  # Reset for downstream usage
        image_stream = io.BytesIO(raw_bytes)
        img = Image.open(image_stream)
        img.verify()  # Verifies file integrity

        # Reopen to read dimensions since verify() closes or alters some image metadata
        image_stream.seek(0)
        img = Image.open(image_stream)
        width, height = img.size

        if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
            return False, f"Image dimensions ({width}x{height}) are too small. Minimum is {MIN_IMAGE_DIMENSION}x{MIN_IMAGE_DIMENSION}px", None

        if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
            return False, f"Image dimensions ({width}x{height}) exceed maximum allowed {MAX_IMAGE_DIMENSION}px", None

        metadata = {
            'filename': filename,
            'content_type': content_type or f"image/{img.format.lower()}",
            'format': img.format,
            'width': width,
            'height': height,
            'aspect_ratio': round(width / height, 4) if height > 0 else 1.0,
            'size_bytes': size
        }
        return True, None, metadata

    except Exception as e:
        return False, f"Invalid or corrupted image file: {str(e)}", None


def extract_svg_content(raw_text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Extracts raw SVG document from Gemini model output.
    Strips markdown fences, surrounding explanations, and comments.
    """
    if not raw_text or not isinstance(raw_text, str):
        return False, None, "Empty model response"

    cleaned = raw_text.strip()

    # Step 1: Remove markdown code fences if present
    fence_pattern = re.compile(r'```(?:xml|svg)?\s*([\s\S]*?)\s*```', re.IGNORECASE)
    fence_matches = fence_pattern.findall(cleaned)
    if fence_matches:
        # Pick the match that contains <svg
        for candidate in fence_matches:
            if '<svg' in candidate.lower():
                cleaned = candidate.strip()
                break

    # Step 2: Locate <svg and </svg>
    svg_start_idx = cleaned.find('<svg')
    if svg_start_idx == -1:
        # Check case-insensitive
        lower_cleaned = cleaned.lower()
        svg_start_idx = lower_cleaned.find('<svg')
        if svg_start_idx == -1:
            return False, None, "No opening <svg> tag detected in output"

    svg_end_idx = cleaned.rfind('</svg>')
    if svg_end_idx == -1:
        lower_cleaned = cleaned.lower()
        svg_end_idx = lower_cleaned.rfind('</svg>')
        if svg_end_idx == -1:
            return False, None, "SVG is incomplete: missing closing </svg> tag"

    extracted = cleaned[svg_start_idx:svg_end_idx + len('</svg>')].strip()
    return True, extracted, None


def sanitize_and_validate_svg(svg_str: str, expected_width: Optional[int] = None, expected_height: Optional[int] = None) -> Tuple[bool, Optional[str], Optional[str], Dict[str, Any]]:
    """
    Parses SVG XML, verifies structure, strips unsafe tags/attributes,
    and returns sanitized SVG string with validation metadata.
    """
    if not svg_str or not isinstance(svg_str, str):
        return False, None, "Empty SVG string", {}

    # Must start with <svg and end with </svg>
    trimmed = svg_str.strip()
    if not trimmed.startswith('<svg') and not trimmed.startswith('<?xml'):
        # Allow XML declaration
        svg_start = trimmed.find('<svg')
        if svg_start != -1:
            trimmed = trimmed[svg_start:]
        else:
            return False, None, "SVG must begin with <svg> root element", {}

    if not trimmed.endswith('</svg>'):
        return False, None, "SVG must end with </svg>", {}

    # Parse XML safely
    try:
        # Remove XML declaration if it causes issues in fragments
        clean_xml = re.sub(r'<\?xml[^>]*\?>', '', trimmed).strip()
        root = ET.fromstring(clean_xml)
    except ET.ParseError as pe:
        return False, None, f"Malformed XML in SVG: {str(pe)}", {}
    except Exception as e:
        return False, None, f"Failed to parse SVG XML: {str(e)}", {}

    # Check root tag is svg (ignoring namespaces like {http://www.w3.org/2000/svg}svg)
    tag_name = root.tag.split('}')[-1] if '}' in root.tag else root.tag
    if tag_name.lower() != 'svg':
        return False, None, f"Root element must be <svg>, found <{tag_name}>", {}

    # Inspect and sanitize tree recursively
    elements_to_remove = []
    has_elements = False

    def sanitize_element(elem, parent=None):
        nonlocal has_elements
        clean_tag = elem.tag.split('}')[-1].lower() if '}' in elem.tag else elem.tag.lower()

        # Check disallowed elements
        if clean_tag in DISALLOWED_SVG_TAGS:
            if parent is not None:
                elements_to_remove.append((parent, elem))
            return

        has_elements = True

        # Sanitize attributes
        keys_to_delete = []
        for attr_key, attr_val in elem.attrib.items():
            clean_attr = attr_key.split('}')[-1].lower() if '}' in attr_key else attr_key.lower()

            # Remove event listeners (onclick, onload, etc.)
            if EVENT_HANDLER_REGEX.match(clean_attr):
                keys_to_delete.append(attr_key)
                continue

            # Remove dangerous URIs in href / xlink:href / src
            if clean_attr in ('href', 'xlink:href', 'src'):
                if DANGEROUS_URI_REGEX.match(attr_val):
                    keys_to_delete.append(attr_key)
                    continue

        for k in keys_to_delete:
            del elem.attrib[k]

        # Recurse children
        for child in list(elem):
            sanitize_element(child, elem)

    sanitize_element(root)

    # Remove unsafe elements
    for parent, child in elements_to_remove:
        try:
            parent.remove(child)
        except ValueError:
            pass

    # Ensure viewBox is present
    viewbox = root.attrib.get('viewBox')
    if not viewbox and expected_width and expected_height:
        root.attrib['viewBox'] = f"0 0 {expected_width} {expected_height}"
        root.attrib['width'] = str(expected_width)
        root.attrib['height'] = str(expected_height)

    # Serialize sanitized XML back to string
    try:
        sanitized_svg = ET.tostring(root, encoding='unicode')
        if 'xmlns=' not in sanitized_svg:
            sanitized_svg = sanitized_svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    except Exception as e:
        return False, None, f"Serialization of sanitized SVG failed: {str(e)}", {}

    metadata = {
        'viewBox': root.attrib.get('viewBox', ''),
        'width': root.attrib.get('width', ''),
        'height': root.attrib.get('height', ''),
        'element_count': len(list(root.iter())),
        'has_elements': has_elements
    }

    if metadata['element_count'] <= 1:
        return False, None, "Generated SVG contains no vector elements or shapes", metadata

    return True, sanitized_svg, None, metadata
