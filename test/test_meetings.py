"""Render the real meeting templates with open slots and populated sessions."""
import copy
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]


class MeetingTemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="meeting-template-test-")
        cls.site = Path(cls.temp.name)
        for folder in ("layouts/informal-meetings", "layouts/partials/meetings", "content/informal-meetings", "data/informal_meetings"):
            shutil.copytree(ROOT / folder, cls.site / folder)
        (cls.site / "assets/css").mkdir(parents=True)
        shutil.copyfile(ROOT / "assets/css/meetings.css", cls.site / "assets/css/meetings.css")
        (cls.site / "layouts/_default").mkdir()
        (cls.site / "layouts/_default/baseof.html").write_text('{{ block "main" . }}{{ end }}')
        (cls.site / "hugo.toml").write_text('baseURL = "https://example.org/"\n')
        cls.original = yaml.safe_load((ROOT / "data/informal_meetings/mhd_ias.yaml").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def render(self, sessions=None):
        data = copy.deepcopy(self.original)
        if sessions is not None:
            data["sessions"] = sessions
        (self.site / "data/informal_meetings/mhd_ias.yaml").write_text(yaml.safe_dump(data))
        subprocess.run([os.environ.get("HUGO_BIN", "hugo"), "--source", str(self.site), "--quiet"], check=True, capture_output=True)
        return (self.site / "public/informal-meetings/magnetohydrodynamics-at-the-ias/index.html").read_text()

    def test_open_slots_are_explicitly_unconfirmed(self):
        html = self.render()
        self.assertEqual(html.count('<tr id="session-'), 4)
        self.assertEqual(html.count("Speaker to be confirmed"), 4)
        self.assertNotIn("<time datetime=", html)
        self.assertNotIn('href=""', html)
        self.assertIn("mailto:beattie@ias.edu", html)

    def test_materials_notes_and_followup_survive_archiving(self):
        session = {"id": "completed", "date": "2026-09-01", "status": "completed", "speaker": "Example Speaker", "title": "A completed discussion", "materials": [{"label": "Reading", "url": "https://example.org/paper"}], "notes": "A recorded result.", "questions": ["What should we calculate next?"], "actions": [{"task": "Check convergence", "owner": "Example Speaker", "status": "Open"}]}
        html = self.render([session])
        archive = html.split('id="archive"', 1)[1]
        self.assertIn('href="https://example.org/paper"', archive)
        for text in ("A recorded result.", "Check convergence", "What should we calculate next?", "Example Speaker"):
            self.assertIn(text, archive)
        self.assertNotIn('id="session-completed"', html.split('id="archive"', 1)[0])

    def test_schedule_is_sorted_and_cancelled_sessions_are_archived(self):
        html = self.render([
            {"id": "later", "date": "2026-10-08", "status": "confirmed"},
            {"id": "cancelled", "date": "2026-10-01", "status": "cancelled"},
            {"id": "earlier", "date": "2026-10-02", "status": "planning"},
        ])
        self.assertLess(html.index('id="session-earlier"'), html.index('id="session-later"'))
        self.assertIn('id="session-cancelled"', html.split('id="archive"', 1)[1])

    def test_empty_series_and_second_series_have_valid_pages(self):
        html = self.render([])
        self.assertIn("The first meeting is being planned", html)
        self.assertNotIn('<tr id="session-', html)
        index = (self.site / "public/informal-meetings/index.html").read_text()
        self.assertIn('/informal-meetings/magnetohydrodynamics-at-the-ias/', index)
        self.assertIn('/informal-meetings/magnetogenesis/', index)
        magnetogenesis = (self.site / "public/informal-meetings/magnetogenesis/index.html").read_text()
        self.assertEqual(magnetogenesis.count('<tr id="session-'), 4)

    def test_session_text_is_escaped(self):
        html = self.render([{"id": "escaped", "status": "planning", "speaker": '<script>alert("test")</script>', "title": "MHD & transport"}])
        self.assertNotIn('<script>alert', html)
        self.assertIn("MHD &amp; transport", html)


if __name__ == "__main__":
    unittest.main()
