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

## `stamped-photo-example.jpg` — optional, and worth adding

The panel shows one real field photograph under "What your photographs should
look like": a pedestal shot with the location, address and time stamp on it, so
a crew can see what a billable photograph carries rather than only read a list.

Drop the file in as `stamped-photo-example.jpg` and it appears. It is loaded
with an `onError` handler, so until the file exists that whole block hides
itself — a broken image beside the words "this is what yours should look like"
is worse than no example.

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
