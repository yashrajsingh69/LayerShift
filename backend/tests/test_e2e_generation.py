"""
LayerShift - End-to-End Vector Layer Generation & Repair Verification Suite
Simulates visual layer extraction, SVG self-repair, multi-layer compositing,
and coordinate synchronization.
"""

import os
import io
import sys
import unittest
from unittest.mock import MagicMock, patch
from PIL import Image

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app
from services.svg_service import prepare_svg_for_layer, format_export_svg
from services.gemini_service import generate_layer_svg, repair_svg
from utils.validation import sanitize_and_validate_svg


def make_dummy_image(w=800, h=800) -> bytes:
    img = Image.new("RGBA", (w, h), color=(20, 20, 25, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestEndToEndVectorGeneration(unittest.TestCase):
    """Verifies complete AI layer extraction, self-repair, and REST communication."""

    def setUp(self):
        self.client = app.test_client()
        self.image_bytes = make_dummy_image(800, 800)

    def test_multi_layer_pipeline(self):
        """Simulate creating multiple independent layers for the same artwork."""
        layers_spec = [
            ("Character Contours", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g id="contours"><path d="M400 200 L500 350 L300 350 Z" stroke="#C7FF4A" stroke-width="4" fill="none"/></g></svg>'),
            ("Clothing Fill", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g id="fills"><polygon points="320,360 480,360 440,540 360,540" fill="#62D9E8"/></g></svg>'),
            ("Background Halo", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g id="background"><circle cx="400" cy="400" r="300" fill="#252932" opacity="0.5"/></g></svg>')
        ]

        generated_layers = []
        for name, raw_svg in layers_spec:
            success, final_svg, err, meta = prepare_svg_for_layer(
                raw_svg,
                target_width=800,
                target_height=800,
                layer_name=name
            )
            self.assertTrue(success, f"Failed to prepare layer {name}: {err}")
            self.assertIn('viewBox="0 0 800 800"', final_svg)
            self.assertTrue(meta['complexity_score'] > 0)
            generated_layers.append(final_svg)

        # Confirm 3 distinct layers generated with matching coordinates
        self.assertEqual(len(generated_layers), 3)

    def test_automatic_repair_workflow(self):
        """Simulate truncated model output triggering repair and producing valid SVG."""
        # Truncated SVG missing closing tags
        broken_output = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g id="outline"><path d="M100 100 L200 200'

        mock_repaired_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g id="outline"><path d="M100 100 L200 200 Z" stroke="#C7FF4A" stroke-width="3" fill="none"/></g></svg>'

        # Mock genai response during repair
        mock_response = MagicMock()
        mock_response.text = mock_repaired_svg

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        # Execute repair
        success, repaired_svg, meta, err = repair_svg(
            broken_svg=broken_output,
            user_prompt="Extract outline",
            width=800,
            height=800,
            error_details="Truncated XML: missing </g> and </svg>",
            client=mock_client,
            model_name="gemini-2.5-flash"
        )

        self.assertTrue(success)
        self.assertIsNotNone(repaired_svg)
        self.assertIn('viewBox="0 0 800 800"', repaired_svg)
        self.assertTrue(repaired_svg.endswith('</svg>'))

    def test_export_svg_header_formatting(self):
        """Ensure standalone exported SVG contains proper XML declarations and comments."""
        sample_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><circle cx="400" cy="400" r="50" fill="lime"/></svg>'
        formatted = format_export_svg(sample_svg, "Cyber Armor Layer")
        self.assertTrue(formatted.startswith('<?xml version="1.0" encoding="UTF-8"?>'))
        self.assertIn('LayerShift: Generate Editable Layers, Not Flat Pixels', formatted)
        self.assertIn('Cyber Armor Layer', formatted)

    def test_generate_layer_mocked_end_to_end(self):
        """Verify REST endpoint /api/generate-layer with valid vision output."""
        mock_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><path d="M50 50 L100 100" stroke="cyan"/></svg>'

        mock_resp = MagicMock()
        mock_resp.text = mock_svg

        with patch('services.gemini_service.get_genai_client') as mock_get_client:
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = mock_resp
            mock_get_client.return_value = (mock_client, None)

            data = {
                'image': (io.BytesIO(self.image_bytes), 'art.png'),
                'prompt': 'Extract cyan line',
                'settings': '{"layerType":"outline","detailLevel":"balanced"}'
            }
            res = self.client.post('/api/generate-layer', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            res_json = res.get_json()
            self.assertTrue(res_json['success'])
            self.assertIn('<svg', res_json['svg'])
            self.assertEqual(res_json['canvas']['width'], 800)
            self.assertEqual(res_json['canvas']['height'], 800)


    def test_local_cv_vector_engine_fallback(self):
        """Verify local computer vision vectorizer produces valid SVG when no key is present."""
        with patch('services.hybrid_vector_engine.get_active_api_key', return_value=None):
            data = {
                'image': (io.BytesIO(self.image_bytes), 'art.png'),
                'prompt': 'Extract character outline',
                'settings': '{"layerType":"outline","detailLevel":"balanced"}'
            }
            res = self.client.post('/api/generate-layer', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            res_json = res.get_json()
            self.assertTrue(res_json['success'])
            self.assertIn('<svg', res_json['svg'])
            self.assertIn('viewBox="0 0 800 800"', res_json['svg'])
            # Accept both legacy 'local_cv' and new 'editing_pipeline' engine names
            self.assertIn(res_json['metadata']['engine'], ['local_cv', 'editing_pipeline', 'local_cv_fallback'])
            self.assertTrue(res_json['metadata']['element_count'] > 0)


if __name__ == '__main__':
    unittest.main()
