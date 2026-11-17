"""
LayerShift - Image Processing Service
Handles image reading, normalization, dimension extraction, and format preparation for Gemini vision API.
"""

import io
import base64
from typing import Dict, Any, Tuple
from PIL import Image

def process_uploaded_image(file_storage) -> Tuple[bytes, str, int, int, Dict[str, Any]]:
    """
    Reads image stream, normalizes, extracts dimensions and returns:
    (image_bytes, mime_type, width, height, metadata)
    """
    stream = file_storage.stream
    stream.seek(0)
    raw_bytes = stream.read()
    stream.seek(0)

    filename = getattr(file_storage, 'filename', 'uploaded_image')
    content_type = getattr(file_storage, 'content_type', '').lower()

    if content_type == 'image/svg+xml' or filename.lower().endswith('.svg'):
        width, height = 800, 800
        try:
            import xml.etree.ElementTree as ET
            import re
            clean_xml = re.sub(r'<\?xml[^>]*\?>', '', raw_bytes.decode('utf-8', errors='ignore')).strip()
            root = ET.fromstring(clean_xml)
            viewbox = root.attrib.get('viewBox', '')
            if viewbox:
                parts = viewbox.split()
                if len(parts) >= 4:
                    width = int(float(parts[2]))
                    height = int(float(parts[3]))
        except Exception:
            pass

        metadata = {
            'filename': filename,
            'width': width,
            'height': height,
            'aspect_ratio': round(width / height, 4) if height > 0 else 1.0,
            'format': 'SVG',
            'mime_type': 'image/svg+xml',
            'size_bytes': len(raw_bytes)
        }
        return raw_bytes, 'image/svg+xml', width, height, metadata

    image_io = io.BytesIO(raw_bytes)
    img = Image.open(image_io)
    width, height = img.size
    orig_format = (img.format or 'PNG').upper()

    # Determine canonical MIME type
    mime_map = {
        'PNG': 'image/png',
        'JPEG': 'image/jpeg',
        'JPG': 'image/jpeg',
        'WEBP': 'image/webp'
    }
    mime_type = mime_map.get(orig_format, 'image/png')

    metadata = {
        'filename': getattr(file_storage, 'filename', 'uploaded_image'),
        'width': width,
        'height': height,
        'aspect_ratio': round(width / height, 4) if height > 0 else 1.0,
        'format': orig_format,
        'mime_type': mime_type,
        'size_bytes': len(raw_bytes)
    }

    return raw_bytes, mime_type, width, height, metadata


def image_bytes_to_data_url(image_bytes: bytes, mime_type: str) -> str:
    """Converts image bytes to base64 Data URL for easy client preview if needed."""
    b64 = base64.b64encode(image_bytes).decode('utf-8')
    return f"data:{mime_type};base64,{b64}"
