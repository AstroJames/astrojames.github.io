"""Check the real Hugo merge against missing and subsequently imported ADS records."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import yaml

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("fetch_publications", ROOT / "scripts/fetch_publications.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class PublicationFallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fallback = yaml.safe_load((ROOT / "data/publication_fallbacks.yaml").read_text())[0]
        cls.temp = tempfile.TemporaryDirectory(prefix="publication-fallback-test-")
        cls.site = Path(cls.temp.name)
        (cls.site / "layouts/partials").mkdir(parents=True)
        (cls.site / "data").mkdir()
        (cls.site / "hugo.toml").write_text('baseURL = "https://example.org/"\n')
        shutil.copyfile(ROOT / "layouts/partials/publication-list.html", cls.site / "layouts/partials/publication-list.html")
        (cls.site / "layouts/index.html").write_text('{{ partial "publication-list.html" site.Data.fixture | jsonify | safeHTML }}')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def render(self, ads, fallbacks=None):
        fixture = {"ads": ads, "fallbacks": [self.fallback] if fallbacks is None else fallbacks}
        (self.site / "data/fixture.json").write_text(json.dumps(fixture))
        subprocess.run([os.environ.get("HUGO_BIN", "hugo"), "--source", str(self.site), "--quiet"], check=True, capture_output=True)
        return json.loads((self.site / "public/index.html").read_text())

    def test_missing_ads_record_remains_visible(self):
        self.assertEqual(self.render([]), [self.fallback])

    def test_ads_refresh_cannot_remove_fallback(self):
        unrelated = {"title": "Another paper", "pubdate": "2026-05-01", "bibcode": "unrelated"}
        self.assertEqual(self.render([unrelated]), [unrelated, self.fallback])

    def test_journal_record_with_arxiv_identifier_takes_precedence(self):
        journal = {"title": "An updated journal title", "pubdate": "2026-09-01", "bibcode": "journal-record", "identifiers": ["arXiv:2604.27088v2"]}
        self.assertEqual(self.render([journal]), [journal])

    def test_arxiv_doi_match_takes_precedence(self):
        ads = {"title": "A changed title", "pubdate": "2026-04-00", "doi_url": "https://doi.org/10.48550/arXiv.2604.27088"}
        self.assertEqual(self.render([ads]), [ads])

    def test_title_match_ignores_case_spacing_and_punctuation(self):
        ads = {"title": "COMPRESSIBLE NAVIER--STOKES FLOW IN SCHRÖDINGER TYPE VARIABLES", "pubdate": "2026-04-00"}
        self.assertEqual(self.render([ads]), [ads])

    def test_repeated_manual_entry_is_not_duplicated(self):
        self.assertEqual(self.render([], [self.fallback, self.fallback]), [self.fallback])

    def test_no_fallbacks_preserves_ads_records(self):
        ads = [{"title": "Another paper", "pubdate": "2026-05-01"}]
        self.assertEqual(self.render(ads, []), ads)

    def test_importer_requests_and_preserves_identifiers(self):
        response = Mock()
        response.json.return_value = {"response": {"docs": []}}
        with patch.object(importer.requests, "get", return_value=response) as get:
            importer.fetch_ads_publications("test-token", "test-orcid")
            importer.fetch_manual_publications("test-token", ["test-bibcode"])
        self.assertEqual(get.call_count, 2)
        for call in get.call_args_list:
            self.assertIn("identifier", call.kwargs["params"]["fl"].split(","))
        self.assertEqual(importer.process_publication({"identifier": ["arXiv:2604.27088"]})["identifiers"], ["arXiv:2604.27088"])


if __name__ == "__main__":
    unittest.main()
