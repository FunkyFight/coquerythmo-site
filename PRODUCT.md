# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + vanilla JavaScript, static build (user choice). Public address: https://coquelicot.world (the default SITE_URL of the build). The host is not fixed; the output must stay a static folder that any host (GitHub Pages, Netlify…) can serve.

## Users

Primary: the amateur dubbing community (fandub, YouTube/Discord dubbers, comic dubbers) who need a free bande rythmo tool they can pick up alone or with friends. Secondary: dubbing professionals (détecteurs, directeurs artistiques, comédiens, studios) who judge on precision, delivery formats and remote sessions. French-speaking first; the app itself also ships in English and Spanish.

## Product Purpose

Coquerythmo is a desktop bande rythmo editor: a video, a band that scrolls under a fixed red reading bar, dialogue lines stretched along their duration on 4 tracks, coloured character labels, markers (boucle, out, changement de scène), breaths, reactions, lip-sync detection signs, karaoke. Around it: recording (solo or online), voicelines cutting, comic dubs, and an export centre. The website presents the software and gets visitors to download it.

## Positioning

Free for everyone, with no feature limits, for personal and professional use (GPL-3.0-only, © 2026 FunkyFight). Readme tagline: "Bande rythmo simple, épurée, optimisée et accessible aux personnes malvoyantes. Tout ça, gratuitement." Few rythmo tools are free, and fewer still work with a screen reader and a keyboard alone.

## Operating Context

- Workspaces (FR labels): Bande rythmo, Enregistrement, Voicelines, Comic Dubs.
- Import: video mp4/mov/avi/mkv/webm; audio flac/wav/mp3/ogg/m4a/aac/opus; subtitles and projects .coquerythmo, .json, .srt, .ass, .detx (Cappella).
- `.coquerythmo` is a self-contained project file (video, audio, font, actor icons, checksums).
- Export centre (Ctrl+M), 4 pages:
  - Vidéo: MP4 with the band, H.264 (NVENC when available), 720p to 8K, 16:9 / 9:16.
  - Sous-titres: JSON, SRT, ASS, DETX.
  - Audio: MP3, WAV 24-bit/48 kHz, BWF stems.
  - Références: CSV / PDF cross-reference, "Grille de croisées PDF".
- Collaboration: a public server plus self-hostable Node server; rooms with a code; roles DA / Co-DA / Comédien; live band sync; the project is shared once and each participant downloads it at their own pace (v5.1).
- Recording: FLAC takes, 3-second countdown, microphone recorded raw.
- Phonetic sign generation from text in French, English and Spanish.
- Community: Discord https://discord.gg/fpdsUyWuwN. Tutorials: https://www.youtube.com/watch?v=m_SpxXRjvmg, https://www.youtube.com/watch?v=nKFU_zl7Duc (V3.4.0), https://www.youtube.com/watch?v=rJi6mt2Jax4 (bande rythmo ensemble).

## Capabilities and Constraints

- Downloads come from GitHub Releases of `funkyfight/coquerythmo-releases` (the same source the in-app updater uses). Latest is v5.1.0, published for Windows only (`Coquerythmo-Installer.exe`, `coquerythmo-v5.1.0-windows-portable.zip`). The latest macOS (aarch64) and Linux builds are v3.5.1. The site must resolve per platform the newest release that actually contains a matching asset, and fall back to the releases page.
- macOS/Linux builds are officially untested (the app warns on startup). The `.coquerythmo` association, `coquerythmo://` links and full screen-reader support are Windows-only; macOS has the internal voice reader through `say`; Linux has no voice reading.
- The auto-updater checks at every start.
- The support/pricing page exists in the code but is hidden (DEV_MODE off) and has no payment flow. The site must not show plans or prices.
- Readme mentions a "Studio mode" that no longer exists. Do not present it.
- Co-DA promotion, kick and ban exist in protocol but have no UI yet. Do not advertise them.
- Stretcher (syllable stretcher) has no toolbar entry. Do not advertise it as a button.

## Brand Commitments

- Name: Coquerythmo. Author: FunkyFight.
- The user asked that the site reuse the app's own UI and treat the rythmo band elements (lines, labels, markers, reading bar) as the site's buttons and presentation devices.
- Voice: direct, generous, a bit informal (the welcome message: "Cette application est gratuite pour que quiconque puisse faire ses bandes rythmos. Créditez le logiciel s'il vous sert dans vos projets s'il vous plait !").
- App icons in `src/icons/` (mostly SVG Repo, CC0) may be reused.

## Evidence on Hand

- Real product facts above, taken from the code and the releases API (77 releases since v1.0.5 on 2026-04-08).
- Three real YouTube tutorials (URLs above), with thumbnails at img.youtube.com.
- No testimonials, customer logos, benchmarks, press or download statistics worth quoting. Do not invent any.
- No screenshots of the app ship in the repo. Any recreated UI or demo band on the site is illustrative and must use clearly fictional dialogue.

## Product Principles

1. Free is the headline, not a footnote.
2. Show the band working rather than describing it.
3. Accessibility is a real feature: the site itself must be usable by keyboard and screen reader.
4. Never claim what the shipped build does not do on that platform.

## Accessibility & Inclusion

The product targets visually impaired users on Windows. The website must meet WCAG 2.2 AA:
- full keyboard operation;
- meaningful labels for every band-element-as-button;
- `prefers-reduced-motion` respected, with the scrolling band pausable;
- no information carried only by colour.
