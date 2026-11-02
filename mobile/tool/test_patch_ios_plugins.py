import tempfile
import hashlib
from pathlib import Path
import unittest

from patch_ios_plugins import patch_package


class NativePatchIsolationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.cache = self.root / "shared-cache"
        self.cache.mkdir()
        (self.cache / "native.m").write_text("old API\n")
        self.package = self.root / "build-package"
        self.package.symlink_to(self.cache, target_is_directory=True)
        self.patches = [{
            "file": "native.m",
            "replacements": [{"before": "old API", "after": "new API"}],
            "before_sha256": hashlib.sha256(b"old API\n").hexdigest(),
            "after_sha256": hashlib.sha256(b"new API\n").hexdigest(),
        }]

    def test_build_copy_is_patched_without_modifying_shared_cache(self):
        self.assertEqual(patch_package(self.package, self.patches), 1)
        self.assertFalse(self.package.is_symlink())
        self.assertEqual((self.package / "native.m").read_text(), "new API\n")
        self.assertEqual((self.cache / "native.m").read_text(), "old API\n")
        self.assertEqual(patch_package(self.package, self.patches), 0)

    def test_unreviewed_upstream_change_fails_before_any_file_is_changed(self):
        self.patches.append({
            "file": "native.m",
            "replacements": [{"before": "unexpected source", "after": "replacement"}],
            "before_sha256": hashlib.sha256(b"old API\n").hexdigest(),
            "after_sha256": "unreachable",
        })
        with self.assertRaises(ValueError):
            patch_package(self.package, self.patches)
        self.assertTrue(self.package.is_symlink())
        self.assertEqual((self.cache / "native.m").read_text(), "old API\n")

    def test_patch_cannot_escape_package(self):
        self.patches[0]["file"] = "../shared-cache/native.m"
        with self.assertRaises(ValueError):
            patch_package(self.package, self.patches)


if __name__ == "__main__":
    unittest.main()
