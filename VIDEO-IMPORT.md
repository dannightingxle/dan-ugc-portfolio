# Video import — 4 videos remaining

11 of the 15 Drive videos were imported on 2026-09-17 (see `public/work/`).
These 4 remain in Dan's Drive folder "Videos " (shared folder:
https://drive.google.com/drive/folders/1tNgxZ_9c9cKcgeFbWPZ9jwih8iPBWgLP)
awaiting a brand/caption from Dan before import:

| Drive file | File ID | Open question |
|---|---|---|
| Six seconds CV template screen demo - edit - 2026-09-07.mp4 | 13HYvn7XotW0ULP0HZk79Bis0Y2dyW0Cy | Which brand/app? |
| Cashback rewards app flights explainer part two - edit - 2026-09-02.mp4 | 1UC6ze9eRShpx1sVQpQlNLCgyv3vNdYeH | Which app? |
| Removing people from holiday photo app - final - 2026-09-02.mp4 | 1LX-Nj2V90cKnmjFyz48-MNJIzuJsWnb_ | Which app? |
| Airport travel deodorant testimonial ad - final - 2026-07-31.mp4 | 1jIjrq6JlTvvkPwzPsHuH9lBQfw-LPhOt | Fussy or Sure? |

Import recipe (as used for the first 11): download via
`https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t`
(environment network access must be "Full"), re-encode with
node_modules/ffmpeg-static/ffmpeg — `-c:v libx264 -crf 27 -preset medium
-pix_fmt yuv420p -profile:v high -c:a aac -b:a 96k -movflags +faststart` —
into `public/work/<name>.mp4`, extract a poster frame at 1s into
`public/work/posters/<name>.jpg`, then add an entry to `WORK` in
`app/page.tsx` (the poster path is derived automatically from videoSrc).

## Other outstanding items

- Colour logo files still wanted for: Applied Nutrition, Warrior, Wellgard
  (these render black-on-white via the `whiteAsset` flag in `app/page.tsx`).

Delete this file once everything is imported.
