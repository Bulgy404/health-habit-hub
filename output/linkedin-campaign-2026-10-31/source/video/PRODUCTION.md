# Give your habit a when

Revised motion post, 31 October 2026.

Final: `../../video/01-give-it-a-when.mp4`

- 18.000 seconds, 1080 × 1350, 30 fps, H.264, silent.
- Optimised for progressive playback with the MP4 index at the beginning.
- Poster colours: acid green `#C7F07A`, ink `#172126`, white `#F5F7F2`.
- Barlow Condensed ExtraBold for headlines; Figtree for supporting copy.
- Title graphics are original SVG paths generated from the supplied fonts. SVG sources and rendered graphics are in this directory.
- The single real app sequence reuses the first eight seconds of the prior native PromoStudio export, retimed to five seconds. Its uniform studio background is keyed out to place the actual phone on the ink backdrop; the app interface is preserved.
- No AI presenter, new voice generation, stock photography, testimonials, numerical claims, or invented app screens.

## Timing

| Time | Picture and copy |
| --- | --- |
| 0–3 | “Give your habit a when.” Three quick text beats complete the headline by 0.6 seconds. |
| 3–6 | Real in-app example: “When I get into bed, I will read a book for ten minutes.” |
| 6–11 | Native app motion, framed by “A plan you can keep track of.” and “Actual app preview”. |
| 11–14 | “Your ordinary Tuesday could help science.” Optional sharing is stated explicitly. |
| 14–18 | Product name, free iOS/Android download prompt, website, and optional TU Dresden sharing message. |

Four extracted preview frames and a contact sheet are in `../../video/`. The full MP4 decoded successfully with FFmpeg after rendering. All five compositions, including the research card, were visually inspected for legibility and clipping.

Builder: `build_motion_post.py`. It creates new vector title art, uses the existing genuine footage as a video input, renders the film, produces previews, and runs the full decode check. Prior campaign files are unchanged.
