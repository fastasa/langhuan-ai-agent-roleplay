# -*- coding: utf-8 -*-

import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from world_draft.core import export_world_directory, scan_world_dir  # noqa: E402


class WorldDraftConverterTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.world_dir = self.root / "测试世界"
        self.world_dir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def write(self, relative_path, content):
        target = self.world_dir / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return target

    def test_scan_uses_contract_rules_and_excludes_drafts(self):
        self.write(
            "index.md",
            "---\n标题: \"测试世界\"\n类型: world\n标签: [\"测试\"]\n---\n# 正文\n",
        )
        self.write("区域/地点.md", "---\n类型: not_real\n---\n地点正文")
        self.write("讨论稿/不应导入.md", "讨论内容")
        self.write("CLAUDE.md", "协作说明")

        contract, warnings = scan_world_dir(self.world_dir)

        self.assertEqual(contract["formatVersion"], 1)
        self.assertEqual(contract["provider"], "langhuan_world_draft")
        self.assertEqual(contract["world"], "测试世界")
        self.assertEqual([unit["path"] for unit in contract["units"]], ["index.md", "区域/地点.md"])
        self.assertEqual(contract["units"][1]["semanticType"], "other")
        self.assertEqual(len(warnings), 1)

    def test_default_output_overwrites_same_name_without_backup(self):
        source = self.write("index.md", "第一版")
        output = self.root / "测试世界-导入稿.json"
        output.write_text("旧文件", encoding="utf-8")

        _, _, target = export_world_directory(self.world_dir)
        source.write_text("第二版", encoding="utf-8")
        export_world_directory(self.world_dir)

        payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(target, output)
        self.assertEqual(payload["units"][0]["content"], "第二版")
        self.assertEqual(list(self.root.glob("测试世界-导入稿.json*")), [output])

    def test_scan_failure_keeps_existing_json_unchanged(self):
        output = self.root / "测试世界-导入稿.json"
        output.write_text("必须保留", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "没有可导入"):
            export_world_directory(self.world_dir)

        self.assertEqual(output.read_text(encoding="utf-8"), "必须保留")


if __name__ == "__main__":
    unittest.main()
