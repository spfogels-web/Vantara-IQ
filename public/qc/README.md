# Quality control reference material

What the daily billing sheet shows crews above the photo uploader, so they can
see what a finished structure is meant to look like before they leave the hole.

Drop these in with exactly these names:

| File | What it is |
| --- | --- |
| `quality-assurance-guide.pdf` | Kinetic OSP Quality Assurance Guide (Windstream, v1.1) |
| `fdh-pedestal.png` | The "Pedestal Style — (FDH) Fiber Distribution Hub" page |
| `flowerpot.png` | The "Flowerpots" page |

The two PNGs are pages 28 and 26 of that guide. Exporting them from the PDF is
enough — they are shown inline, where the guide itself is a link.

Any of them being absent is fine. The panel checks before it offers: images
hide themselves if they fail to load, and the guide link asks for the file's
headers before it renders. Sending a crew to a missing file is worse than not
offering it, because they stop trusting the other links on the page.
