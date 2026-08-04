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
  return !mapUrl.startsWith("data:application/pdf") && !/\.pdf(\?|$)/i.test(mapUrl);
}

export function projectImageSrc(project: {
  photoUrl?: string | null;
  mapUrl?: string | null;
}): string | null {
  if (project.photoUrl) return project.photoUrl;
  return isRasterMap(project.mapUrl) ? project.mapUrl! : null;
}
