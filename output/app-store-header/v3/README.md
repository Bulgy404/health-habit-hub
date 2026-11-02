# Health Habit Hub — logo-first App Store banner

The heart-and-three-node mark and the brand name are the only foreground content. Sparse, cropped connected circles at the outer edges echo the knowledge graph without introducing a diagram or interface.

## Deliverables

- `health-habit-hub-banner-light.png`: pale green field, green mark, dark lettering.
- `health-habit-hub-banner-green.png`: brand primaryDark field, white mark and lettering.
- Matching `.svg` files: self-contained vectors with outlined Figtree lettering; no fonts or external images required to view or export.

Both PNG exports are verified as 3840 × 1646 pixels without an alpha channel. They are rendered directly from vectors without upscaling.

## Brand sources

- Mark geometry: original parametric heart and connected-dot placement from `mobile/assets/icon/generate_icon.py`, flattened for a banner. The light version reverses the mark color for contrast on a pale field.
- Typography: Figtree, already used by the marketing site, at weight 550. Glyph outlines are embedded in the SVG.
- Colors: primaryDark `#2E8C00`, with pale green and tonal green supporting elements.

All essential branding is within the central 50% of the canvas width and central 40% of its height. Check the actual crop in App Store Connect before submission. Neither asset has been uploaded or submitted.

`create-banner.py` is the reproducible vector source. It uses the repository's Figtree font and FontTools; a local Homebrew Brotli decoder fallback supports WOFF2 fonts on this workstation.
