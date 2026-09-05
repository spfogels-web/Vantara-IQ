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

Note: this document is marked *Sensitivity: Internal* by Windstream. Anything
in `public/` is fetchable by URL without signing in. If that is not wanted, move
it into Documents and point GUIDE.href at that record instead.
