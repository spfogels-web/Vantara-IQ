# Quality control reference material

`quality-assurance-guide.pdf` is Windstream's Kinetic OSP Quality Assurance
Guide (v1.1). The daily billing sheet links it above the photo uploader, along
with shortcuts to the four pages a buried crew needs:

| Page | Section |
| --- | --- |
| 25 | Pedestals |
| 26 | Flowerpots |
| 28 | Pedestal Style — (FDH) Fiber Distribution Hub |
| 29 | Handholes |

Those are deep links (`#page=25`), not copies, so a revised guide only has to
be dropped in here once. If the page numbering changes, update `SPEC_PAGES` in
`src/components/dailies/quality-control.tsx`.

The panel checks the file is really there before offering it — a HEAD request
that has to come back as a PDF, because an unknown path in this app is answered
by the catch-all route with a healthy placeholder page. Absent, the whole block
hides and the written checklist still stands.

## `pedestal-BD4MPF.jpg` / `pedestal-BD4MPFrear.jpg` — our own work

The panel shows these two under "What your photographs should look like": a
Fortitude ped on Rock Creek Rd, stamped the way every field photograph has to
be. Real ones rather than a diagram, because a crew recognises the job before
they read a word of the list beside it.

The front shot carries the position, heading and address, the 811 and Uniti
stickers, the route marker `2032 @ 3A` and the IN/OUT written on the tray. The
rear shot is the grounding with the parts named on the picture — ground rod,
acorn, copper wire — which is what an approver looks for and cannot infer from
a photograph of a closed ped.

**These are JPEGs on purpose.** They arrived as 2.3MB and 1.9MB PNGs, which is
the wrong format for a photograph: 4.2MB of reference image on a page a crew
opens from a truck twenty times a week. Re-encoded at 900px wide, quality 82,
they are 384KB for the pair and the stamp is still readable opened full size.
If they are ever replaced, run them through the same conversion — a PNG of a
photograph is roughly ten times the bytes for no visible gain:

```
npx sharp-cli -i in.png -o out.jpg resize 900 -- jpeg --quality 82
```

Each hides itself with an `onError` handler if its file goes missing, so a
broken frame never appears beside the words "this is what yours should look
like".

## Who can read these

Not the same answer for every file here, which is worth knowing.

The middleware matcher excludes `png|jpg|jpeg|gif|webp|svg|ico`, so the example
images are served without going through it and are fetchable by URL by anyone.
`.pdf` is **not** excluded, so the guide does go through middleware and needs a
session — and `/qc` had to be added to the subcontractor allowlist before crews
could read it at all. Until that was added the Quality Control panel rendered
its guide and examples for staff and nothing for the crews it is written for,
because the HEAD request came back as a redirect rather than a PDF.

So: the guide is behind a login, the images are not. That is the opposite way
round from what somebody would assume from both sitting in `public/`.

Note: this document is marked *Sensitivity: Internal* by Windstream. If the
image files should be behind a login too, they need to move out of `public/` —
the matcher will not send them through middleware while they are here.
