#!/usr/bin/env python3
"""Maintain reviewed native fixes in project-owned Flutter packages.

The maintained packages in third_party are normal path dependencies, so Xcode
and Flutter compile the same reviewed sources. No transient overrides or
build-time source modifications are required. Reviewed hashes guard every edit.
"""

import json
import hashlib
import argparse
from pathlib import Path
import shutil
import tempfile


def patched_sources(package, patches):
    """Validate every edit before changing any source in this package."""
    sources = {}
    for patch in patches:
        relative = Path(patch["file"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"Invalid patch path: {relative}")
        source = package / relative
        text = source.read_text()
        digest = hashlib.sha256(text.encode()).hexdigest()
        if digest == patch["after_sha256"]:
            continue
        if digest != patch["before_sha256"]:
            raise ValueError(f"Unreviewed source in {source}; review the upstream update")
        original = text
        for replacement in patch["replacements"]:
            before, after = replacement["before"], replacement["after"]
            if before and before in text:
                text = text.replace(before, after)
            else:
                raise ValueError(f"Patch context changed in {source}; review the upstream update")
        if hashlib.sha256(text.encode()).hexdigest() != patch["after_sha256"]:
            raise ValueError(f"Patched source hash mismatch in {source}")
        if text != original:
            sources[relative] = text
    return sources


def patch_package(package, patches):
    edits = patched_sources(package, patches)
    if not edits:
        return 0
    # Flutter's .packages entries point at a shared cache. Materialize a local
    # copy first; writes must never pass through that link into another app.
    if package.is_symlink():
        with tempfile.TemporaryDirectory(dir=package.parent) as temporary:
            local = Path(temporary) / "package"
            shutil.copytree(package.resolve(), local, symlinks=False)
            for relative, content in edits.items():
                (local / relative).write_text(content)
            package.unlink()
            local.rename(package)
    else:
        for relative, content in edits.items():
            source = package / relative
            if not source.resolve().is_relative_to(package.resolve()):
                raise ValueError(f"Refusing to write through external source link: {source}")
            source.write_text(content)
    return len(edits)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Verify the checked-in native fixes")
    mode.add_argument("--vendor", action="store_true", help="Refresh reviewed packages from the pub cache")
    parser.add_argument("--source-cache", type=Path,
                        default=Path.home() / ".pub-cache/hosted/pub.dev")
    args = parser.parse_args()
    mobile = Path(__file__).resolve().parents[1]
    patches = json.loads(Path(__file__).with_name("ios_plugin_patches.json").read_text())
    vendor = mobile / "third_party"
    for name, changes in patches.items():
        plugin, version = name.rsplit("-", 1)
        platform = "darwin" if plugin in ("sentry_flutter", "posthog_flutter") else "ios"
        local = vendor / name
        if args.vendor:
            source = args.source_cache / name
            # Validate every native edit before replacing the maintained copy.
            patched_sources(source / platform / plugin, changes)
            if source.resolve() == local.resolve():
                raise ValueError("The source cache must be separate from the maintained copy")
            if local.exists():
                shutil.rmtree(local)
            shutil.copytree(source, local, ignore=shutil.ignore_patterns(
                "example", "test", "integration_test", "docs", "doc", "screenshots",
                ".github", ".idea", ".dart_tool", ".swiftpm", ".build", ".gradle",
                "build", "AGENTS.md", "CLAUDE.md"))
            patch_package(local / platform / plugin, changes)
            pubspec = local / "pubspec.yaml"
            pubspec.write_text(pubspec.read_text().replace("resolution: workspace\n", ""))
            (local / "UPSTREAM.md").write_text(
                f"Maintained copy of {plugin} {version} from "
                f"https://pub.dev/packages/{plugin}/versions/{version}.\n\n"
                "The upstream LICENSE is retained. Native changes are recorded in "
                "../../tool/ios_plugin_patches.json. The workspace-resolution field "
                "is removed from pubspec.yaml for standalone path dependencies.\n")
        if not (local / "LICENSE").is_file():
            raise ValueError(f"Upstream license is missing for {name}")
        for patch in changes:
            source = local / platform / plugin / patch["file"]
            digest = hashlib.sha256(source.read_text().encode()).hexdigest()
            if digest != patch["after_sha256"]:
                raise ValueError(f"Native fix is missing or has changed: {source}")
    print(f"Reviewed native fixes verified in all {len(patches)} maintained packages")


if __name__ == "__main__":
    main()
