# Video import — pending task

New portfolio videos live in Dan's Google Drive folder **"Videos "** (note trailing space),
inside the shared folder: https://drive.google.com/drive/folders/1tNgxZ_9c9cKcgeFbWPZ9jwih8iPBWgLP

They could not be downloaded from the original Claude session because the environment's
network policy blocked drive.google.com / drive.usercontent.google.com, and the Drive MCP
connector cannot transfer video-sized files. Once network access allows it, download each
file below (`https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t`),
run `compress.sh` (uses node_modules/ffmpeg-static, H.264 CRF 27, +faststart), generate a
poster frame into `public/work/posters/<name>.jpg`, and add entries to `WORK` in `app/page.tsx`.

## File → brand mapping (confirmed by Dan, 2026-09-17)

| Drive file | File ID | Brand / caption | Suggested filename |
|---|---|---|---|
| H1.mp4 | 17QMq4uZUM-wXB4lyaahhjHg-2VmmGKJy | HelpBnk — world's biggest business competition | helpbnk-competition.mp4 |
| H1 (1).mp4 | 1yzAKBFOFJ-uYpah51DIjcz9qSCiJ6uGB | HelpBnk — same concept, second cut | helpbnk-competition-2.mp4 |
| H2.mp4 | 1o6_Dlkm6XnIE9CWVJ-oPDGhHaX9BNPGk | Fussy — natural deodorant | fussy-2.mp4 |
| V1.mp4 | 1KwXrNsbQYWJEQiIBApHIr-3gjDre5Bhm | Grenade — Oreo protein powder launch | grenade-oreo.mp4 |
| V1 (1).mp4 | 188TNzbNk_2aXwfernqN4RHCHwqr6fA7n | Strike — electrolytes | strike-electrolytes.mp4 |
| V4.mp4 | 1vi8NN3k9Kx9n4IvdbfKIIJ5lf0J-lhkF | Sure — Man City, Manchester Derby concept | sure-derby.mp4 |
| loop-01-loop-bike-mount-sept-2026-export.mp4 | 116U1T2fl2tkREjl_0mpZQa4O_Mf769_c | Loop — bike mount | loop-bike-mount.mp4 |
| grapetree-01-grape-tree-4pm-snack-swap-aug-2026.mp4 | 1t59TtOtdpp0ezsxc8NoHc_46P1t1WN6d | Grape Tree — 4pm snack swap | grapetree-snack-swap.mp4 |
| Gin cocktail LA giveaway ad - final - 2026-09-10.mp4 | 1As8nCxq8GtjyisMOhziY3JSad5Sw5SyH | STILL G.I.N. — cocktail LA giveaway ad | still-gin-giveaway.mp4 |
| Heat check hot day drinking Coors outside - final - 2026-08-08.mp4 | 1R58NQBi1rh_GbFOF-J_d0l7-CZ_feXqI | Coors — heat check | coors-heat-check.mp4 |
| Cold activated can temperature detection demo - final - 2026-08-03.mp4 | 1x-17PcxuEVOcRQaZm0a_RiCO87gPfE4R | Coors — cold-activated can demo (assumed Coors; confirm) | coors-cold-can.mp4 |
| Six seconds CV template screen demo - edit - 2026-09-07.mp4 | 13HYvn7XotW0ULP0HZk79Bis0Y2dyW0Cy | UNKNOWN BRAND — ask Dan | tbc |
| Cashback rewards app flights explainer part two - edit - 2026-09-02.mp4 | 1UC6ze9eRShpx1sVQpQlNLCgyv3vNdYeH | UNKNOWN BRAND — ask Dan | tbc |
| Removing people from holiday photo app - final - 2026-09-02.mp4 | 1LX-Nj2V90cKnmjFyz48-MNJIzuJsWnb_ | UNKNOWN BRAND — ask Dan | tbc |
| Airport travel deodorant testimonial ad - final - 2026-07-31.mp4 | 1jIjrq6JlTvvkPwzPsHuH9lBQfw-LPhOt | Fussy or Sure (deodorant) — ask Dan which | tbc |

## Other outstanding items

- Sure logo still needed in the Drive "Logos" folder (Dan pasted it in chat; not retrievable
  from chat). Add a "Sure" tile to `FEATURED_BRANDS` once the file exists.
- Larger OneFamily logo wanted (current file is 200px and fuzzy).
- Colour JustFloow logo wanted (current SVG is a low-res white knockout).
- Colour versions still wanted for: Applied Nutrition, Warrior, Wellgard, Anker
  (these render black-on-white via the `whiteAsset` flag in `app/page.tsx`).

Delete this file once the import is complete.
