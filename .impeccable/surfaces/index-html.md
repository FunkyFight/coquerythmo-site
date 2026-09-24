---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface: landing page (index.html)

Scope: the single presentation and download page for Coquerythmo. Mode: Persuade.
Audience: amateur dubbing community first (fandub, YouTube/Discord dubbers), professionals second.
Action: download the right build for your OS, from GitHub Releases, resolved live. Second action: join the Discord.
Proof: the page runs a working demo band built from the app's own rendering rules, and it uses the app's real icons and real lip drawings. Every claim comes from PRODUCT.md.
Constraints:
- no prices or plans;
- no Studio mode, and no Co-DA promotion or kick/ban UI;
- macOS and Linux are shown with their real latest version (3.5.1) and the "non testée" caveat;
- the demo dialogue is fictional and labelled as a demo project.

## Direction contract

THESIS: The first screen is the Coquerythmo window itself: menus navigate, tabs switch workspaces, the video shows the pitch, and the download buttons are dialogue lines on a working bande rythmo. It refuses the category default: a centered hero with a screenshot and two pill buttons.

OWN-WORLD: The app's wgpu chrome:
- surfaces #1C1C21 topbar, #0F0F12 video, #1A1A1F toolbar, #050508 band;
- widgets with a 2-stop gradient (#333 to #212126), a 1px #4D4D5C border, 8px or 4px radii;
- violet #7366D9 as the accent, blue #6194F5 for focus, playhead red #FF050D with glow;
- ruler ticks on the band;
- character labels in bold italic, double-underlined in the character colour;
- dialogue text stretched horizontally over its duration;
- markers: red ✕ boucle with its number, // out, white scene change;
- app SVG icons; a light-grey work-copy frame holding the hand-drawn lips.

STORY: The visitor sees a band playing a fictional dub scene while the lips in the video sync to it. They understand the tool in seconds. They learn that it is free, then read the workspaces, detection, export, collaboration and accessibility, then download.

FIRST VIEWPORT (1440×900):
- 32px menus (Projet, Export, Outils, Connexion, Accessibilité, Tutoriels; Discord and settings on the right);
- 36px tabs;
- ~500px video zone with a centred 16:9 work-copy frame: H1 on the left, lip-sync drawing on the right, burned timecode;
- 76px functional toolbar;
- ~250px band: the intro plays, then parks with the three OS download lines on the red bar (your OS first, on track 1). That parked band is the primary action.

FORM: "La fenêtre Coquerythmo", #2 on my ordered list, seed key 040939ea. Signature interaction: the band is a real instrument. Drag to scrub, Espace plays, Numpad and toolbar add markers, and clicking a line selects it with handles; download lines download. Motion grammar: linear right-to-left time for anything on the band; instant app-like state changes for the chrome. Sections below open with a slim band strip whose numbered boucle marks the chapter.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Static host not chosen (the address is https://coquelicot.world).
- The real macOS/Linux builds are old (3.5.1); the site shows that as is.
