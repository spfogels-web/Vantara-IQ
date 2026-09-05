# Quality control reference sheets

Two images the daily billing sheet shows crews above the photo uploader, so
they can see what a finished structure is meant to look like before they leave
the hole.

Drop the Windstream spec pages in here with exactly these names:

| File | Page |
| --- | --- |
| `fdh-pedestal.png` | "Pedestal Style — (FDH) Fiber Distribution Hub" |
| `flowerpot.png` | "Flowerpots" |

PNG or JPG both work; keep the extension `.png` in the filename either way, or
change the paths in `src/components/dailies/quality-control.tsx`.

Either file being absent is fine — that panel hides the missing one and the
written checklist still shows. A broken image on a compliance panel reads as a
broken app, so it is better to show nothing.
