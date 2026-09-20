/**
 * Which image represents a project.
 *
 * One rule, used everywhere a project appears — the directory, the project
 * page, the daily-sheet job picker. A crew that set a cover photo expects to
 * recognise that job by it wherever it shows up; different precedence per
 * screen is how the same project ends up looking like two different jobs.
 *
 * Order: the jobsite photo somebody chose, then the uploaded map if it is a
 * raster we can actually draw. A PDF map cannot be rendered as an image, which
 * is why it is excluded rather than handed to an <img> that renders nothing.
 */
export function isRasterMap(mapUrl?: string | null): boolean {
  if (!mapUrl) return false;
  // A data URI states its own type, so believe it rather than inferring from
  // what it is not. Excluding only PDFs meant every other kind — a plain-text
  // placeholder, a DWG, a TIFF — was treated as a raster and handed to an
  // <img> that renders nothing, which is the case this function exists to
  // prevent.
  if (mapUrl.startsWith("data:")) return mapUrl.startsWith("data:image/");
  return !/\.pdf(\?|$)/i.test(mapUrl);
}

export function projectImageSrc(project: {
  photoUrl?: string | null;
  mapUrl?: string | null;
}): string | null {
  if (project.photoUrl) return project.photoUrl;
  return isRasterMap(project.mapUrl) ? project.mapUrl! : null;
}
