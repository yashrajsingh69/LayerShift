"""
LayerShift Backend - Comprehensive Unit & Integration Test Suite
Tests image validation, SVG extraction, XML parsing, sanitization,
coordinate systems, quota handling, and REST endpoints.
"""

import os
import io
import sys
import unittest
from PIL import Image

# Add backend directory to sys.path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from utils.validation import (
    validate_image_file,
    extract_svg_content,
    sanitize_and_validate_svg,
    MAX_FILE_SIZE_BYTES
)
from services.svg_service import prepare_svg_for_layer, format_export_svg
from services.gemini_service import parse_quota_error
from app import app


class DummyFileStorage:
    """Mock for Flask FileStorage object."""
    def __init__(self, filename: str, content_type: str, data: bytes):
        self.filename = filename
        self.content_type = content_type
        self.stream = io.BytesIO(data)


def create_test_image(format_name="PNG", width=500, height=500, color="red") -> bytes:
    """Creates in-memory image bytes for testing."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format=format_name)
    return buf.getvalue()


class TestImageValidation(unittest.TestCase):
    """Verifies file type validation, size limits, and Pillow integrity checks."""

    def test_valid_png_upload(self):
        png_bytes = create_test_image("PNG", 400, 300)
        file_obj = DummyFileStorage("test.png", "image/png", png_bytes)
        valid, err, meta = validate_image_file(file_obj)
        self.assertTrue(valid)
        self.assertIsNone(err)
        self.assertEqual(meta['width'], 400)
        self.assertEqual(meta['height'], 300)
        self.assertEqual(meta['format'], 'PNG')

    def test_valid_jpeg_upload(self):
        jpeg_bytes = create_test_image("JPEG", 600, 400)
        file_obj = DummyFileStorage("photo.jpg", "image/jpeg", jpeg_bytes)
        valid, err, meta = validate_image_file(file_obj)
        self.assertTrue(valid)
        self.assertIsNone(err)
        self.assertEqual(meta['width'], 600)
        self.assertEqual(meta['height'], 400)

    def test_valid_webp_upload(self):
        webp_bytes = create_test_image("WEBP", 250, 250)
        file_obj = DummyFileStorage("art.webp", "image/webp", webp_bytes)
        valid, err, meta = validate_image_file(file_obj)
        self.assertTrue(valid)
        self.assertIsNone(err)

    def test_reject_unsupported_file_type(self):
        file_obj = DummyFileStorage("document.pdf", "application/pdf", b"%PDF-1.4...")
        valid, err, meta = validate_image_file(file_obj)
        self.assertFalse(valid)
        self.assertIn("Unsupported file type", err)

    def test_reject_empty_file(self):
        file_obj = DummyFileStorage("empty.png", "image/png", b"")
        valid, err, meta = validate_image_file(file_obj)
        self.assertFalse(valid)
        self.assertIn("empty", err.lower())

    def test_reject_corrupted_image(self):
        file_obj = DummyFileStorage("corrupt.png", "image/png", b"\x89PNG\r\n\x1a\ncorruptedjunkbytes")
        valid, err, meta = validate_image_file(file_obj)
        self.assertFalse(valid)
        self.assertIn("Invalid or corrupted", err)


class TestSVGExtractionAndSanitization(unittest.TestCase):
    """Verifies markdown fence stripping, XML validity, and security sanitization."""

    def test_extract_svg_from_fenced_markdown(self):
        raw = """Here is the generated vector layer:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
  <circle cx="250" cy="250" r="100" fill="lime"/>
</svg>
```
Hope you enjoy it!"""
        success, extracted, err = extract_svg_content(raw)
        self.assertTrue(success)
        self.assertTrue(extracted.startswith('<svg'))
        self.assertTrue(extracted.endswith('</svg>'))

    def test_detect_incomplete_svg_missing_closing_tag(self):
        truncated = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><path d="M10 10 L50'
        success, extracted, err = extract_svg_content(truncated)
        self.assertFalse(success)
        self.assertIn("missing closing </svg>", err)

    def test_detect_missing_opening_svg_tag(self):
        missing_open = 'Just some text and </svg>'
        success, extracted, err = extract_svg_content(missing_open)
        self.assertFalse(success)
        self.assertIn("No opening <svg>", err)

    def test_sanitize_strips_malicious_scripts_and_events(self):
        malicious_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" onload="alert('xss')">
  <script>evil_script();</script>
  <circle cx="250" cy="250" r="80" fill="cyan" onclick="stealCookies()"/>
  <a href="javascript:void(0)"><text x="10" y="20">Click me</text></a>
</svg>"""
        valid, sanitized, err, meta = sanitize_and_validate_svg(malicious_svg, 500, 500)
        self.assertTrue(valid)
        self.assertNotIn('<script', sanitized)
        self.assertNotIn('onload', sanitized)
        self.assertNotIn('onclick', sanitized)
        self.assertNotIn('javascript:', sanitized)
        self.assertIn('<circle', sanitized)

    def test_prepare_svg_for_layer_enforces_viewbox(self):
        svg_without_viewbox = '<svg><rect x="0" y="0" width="100" height="100" fill="blue"/></svg>'
        success, final_svg, err, meta = prepare_svg_for_layer(svg_without_viewbox, 1024, 768)
        self.assertTrue(success)
        self.assertIn('viewBox="0 0 1024 768"', final_svg)
        self.assertEqual(meta['shape_count'], 1)


class TestQuotaErrorHandling(unittest.TestCase):
    """Verifies Gemini 429 quota delay parsing."""

    def test_parse_quota_error_with_delay(self):
        error_text = "429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'GenerateContentRequests' retryDelay: 18.5s"
        info = parse_quota_error(error_text)
        self.assertTrue(info['is_quota_exhausted'])
        self.assertEqual(info['retry_delay_seconds'], 18.5)

    def test_parse_quota_error_without_delay(self):
        error_text = "429 RESOURCE_EXHAUSTED: Daily limit reached"
        info = parse_quota_error(error_text)
        self.assertTrue(info['is_quota_exhausted'])
        self.assertIsNone(info['retry_delay_seconds'])


class TestAPIEndpoints(unittest.TestCase):
    """Tests REST endpoints using Flask test client."""

    def setUp(self):
        self.client = app.test_client()

    def test_health_endpoint(self):
        response = self.client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['status'], 'healthy')
        self.assertIn('gemini_configured', data)
        self.assertIn('selected_model', data)

    def test_models_endpoint(self):
        response = self.client.get('/api/models')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn('models', data)
        self.assertIn('active_model', data)
        self.assertTrue(len(data['models']) > 0)

    def test_sample_images_endpoint(self):
        response = self.client.get('/api/sample-images')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertTrue(len(data['samples']) >= 3)

    def test_generate_layer_rejects_missing_image(self):
        response = self.client.post('/api/generate-layer', data={"prompt": "Extract outline"})
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data['success'])
        self.assertIn("No image file", data['error'])

    def test_generate_layer_rejects_empty_prompt(self):
        png_bytes = create_test_image()
        data = {
            'image': (io.BytesIO(png_bytes), 'test.png'),
            'prompt': '   '
        }
        response = self.client.post('/api/generate-layer', data=data, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 400)
        res_json = response.get_json()
        self.assertFalse(res_json['success'])
        self.assertIn("Prompt cannot be empty", res_json['error'])

    def test_repair_svg_rejects_empty_payload(self):
        response = self.client.post('/api/repair-svg', json={})
        self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()
