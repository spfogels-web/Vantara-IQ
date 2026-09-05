/**
 * Spanish for the crews who work in it.
 *
 * Most of the people filing dailies speak Spanish first, and the cost of an
 * English-only screen is not inconvenience — it is a sheet filled in wrong.
 *
 * Three decisions worth knowing:
 *
 * 1. **Keyed by the English string, not by an invented key.** `t("Photos")`
 *    rather than `t("dailies.docs.photos")`. A missing translation falls back
 *    to readable English instead of a key nobody can act on, and nothing has to
 *    be renamed to add a language.
 *
 * 2. **Globe's form stays in English.** The daily billing sheet is Globe's own
 *    document — GLS-203155 — and it is what they pay against. A Spanish column
 *    header on a submitted sheet is a rejected sheet. Field labels there get a
 *    Spanish hint on screen that is hidden from print, so the crew knows what
 *    goes in the box and Globe still receives its form.
 *
 * 3. **Unit codes, money and dates are never translated.** BFOV, BM61, BHF and
 *    the rest are Globe's codes. Money is US dollars against a US contract, and
 *    a date read the wrong way round on a billing week is a payment dispute.
 *
 * Latin American Spanish, since that is who is on these crews.
 */

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "vq_lang";

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/**
 * Spanish, by English source string.
 *
 * Trade words are the ones worth being careful about: a crew says "cuadrilla",
 * not "equipo"; a bore is a "perforación"; a handhole is a "registro". Where
 * the trade in the US Southeast uses the English word on site — as-built,
 * redline — it is kept alongside the Spanish so nobody has to guess.
 */
const ES: Record<string, string> = {
  // ── Navigation ───────────────────────────────────────────────────
  "Operations Center": "Centro de operaciones",
  Projects: "Proyectos",
  Dailies: "Reportes diarios",
  "My projects": "Mis proyectos",
  "Company profile": "Perfil de la empresa",
  "Yard badges": "Credenciales de patio",
  Tasks: "Tareas",
  "Pay statements": "Estados de pago",
  Support: "Soporte",
  Settings: "Configuración",
  Documents: "Documentos",
  Materials: "Materiales",
  Overview: "Resumen",
  // Markets. The names stay as they are said on site — a crew asks about
  // "Alabama", not about "el mercado de Alabama".
  Market: "Mercado",
  "All markets": "Todos los mercados",
  "North Georgia": "Norte de Georgia",
  "South Georgia": "Sur de Georgia",
  Alabama: "Alabama",
  Unassigned: "Sin asignar",
  Current: "En curso",
  Completed: "Terminado",
  "My work": "Mi trabajo",
  Network: "Red",
  Financials: "Finanzas",
  Intelligence: "Inteligencia",
  Workspace: "Espacio de trabajo",

  // ── Top bar ──────────────────────────────────────────────────────
  Create: "Crear",
  "Quick actions": "Acciones rápidas",
  "Daily billing sheet": "Hoja de facturación diaria",
  "New project": "Proyecto nuevo",
  "Open dailies to start or upload a sheet":
    "Abrir reportes diarios para crear o subir una hoja",
  "Open projects to set up a new job": "Abrir proyectos para dar de alta una obra",
  "Search projects, dailies, crews…": "Buscar proyectos, reportes, cuadrillas…",
  Notifications: "Notificaciones",
  "Mark all read": "Marcar todo como leído",
  "View all notifications": "Ver todas las notificaciones",
  "Manage profile": "Administrar perfil",
  "Workspace settings": "Configuración del espacio",
  "Give feedback": "Enviar comentarios",
  "Sign out": "Cerrar sesión",
  Language: "Idioma",
  Crew: "Cuadrilla",
  "Crew portal": "Portal de la cuadrilla",
  Live: "En vivo",

  // ── Dailies ──────────────────────────────────────────────────────
  "Daily billing sheets": "Hojas de facturación diaria",
  "awaiting review": "en espera de revisión",
  "Every crew's daily production, digitized from the field. The AI reads each sheet, reconciles quantities and documentation, and stages it for your team's review.":
    "La producción diaria de cada cuadrilla, digitalizada desde el campo. La IA lee cada hoja, cuadra las cantidades y la documentación, y la deja lista para que su equipo la revise.",
  "The days your crew has filed, and where each one stands with Fortitude.":
    "Los días que ha reportado su cuadrilla y en qué estado está cada uno con Fortitude.",
  All: "Todos",
  Submitted: "Enviado",
  "In review": "En revisión",
  Approved: "Aprobado",
  Denied: "Rechazado",
  "All projects": "Todos los proyectos",
  "All crews": "Todas las cuadrillas",
  "Filter by project": "Filtrar por proyecto",
  "Filter by crew": "Filtrar por cuadrilla",
  Billable: "Facturable",
  margin: "margen",
  unpriced: "sin precio",
  "Work date": "Fecha de trabajo",
  "Road(s) worked": "Calle(s) trabajada(s)",
  REQUIRED: "OBLIGATORIO",
  "Keener Rd — or Hwy 17 to Pierce Creek": "Keener Rd — o Hwy 17 hasta Pierce Creek",
  "Shows on the daily so this day can be told from the others on the job.":
    "Aparece en el parte diario para distinguir este día de los demás del trabajo.",
  submitted: "enviado",
  Sheet: "Hoja",
  "Bills to week ending ": "Se factura a la semana que termina ",
  "Bill this day to the week ending": "Facturar este día a la semana que termina",
  "moved by the office": "cambiado por la oficina",
  Photos: "Fotos",
  None: "Ninguna",
  "As-built": "Plano final (as-built)",
  "Bore log": "Registro de perforación",
  Attached: "Adjunto",
  Missing: "Falta",
  "AI review": "Revisión de la IA",
  "No discrepancies detected": "No se detectaron diferencias",
  "for your team to review": "para que su equipo revise",
  "Quantities, documentation and unit codes all reconcile. Cleared for billing.":
    "Las cantidades, la documentación y los códigos cuadran. Listo para facturar.",
  "Nothing is approved automatically — the AI prepares, your team decides.":
    "Nada se aprueba solo — la IA prepara y su equipo decide.",
  "Globe billing sheet": "Hoja de facturación de Globe",
  "The filled-in form and the day's redlined map, as submitted.":
    "El formulario lleno y el plano marcado del día, tal como se envió.",
  "Open billing sheet": "Abrir hoja de facturación",
  "Line items": "Partidas",
  "Unit code": "Código",
  Location: "Ubicación",
  Quantity: "Cantidad",
  "Approved by Fortitude": "Aprobado por Fortitude",
  "Sent back by Fortitude": "Devuelto por Fortitude",
  "Reason — required to deny, optional to approve":
    "Motivo — obligatorio para rechazar, opcional para aprobar",
  "Delete this daily": "Eliminar este reporte",
  "Delete it": "Eliminarlo",
  "No new underground work found on this print.":
    "No se encontró obra subterránea nueva en este plano.",

  // ── Import ───────────────────────────────────────────────────────
  Job: "Obra",
  "Filing this for": "Se reporta para",
  "Drop a daily here, or tap to choose":
    "Suelte un reporte aquí, o toque para elegir",
  "PDF or photo of the billing sheet. It comes back as a draft for you to check.":
    "PDF o foto de la hoja de facturación. Regresa como borrador para que usted lo revise.",
  "Billing sheet": "Hoja de facturación",

  // ── The Globe form: hints only, never the form itself ─────────────
  "Sheet number": "Número de hoja",
  "Work order": "Orden de trabajo",
  Foreman: "Capataz",
  Date: "Fecha",
  "Work Order Complete": "Orden de trabajo terminada",
  "Crew Number": "Número de cuadrilla",
  "Customer Name": "Nombre del cliente",
  "Date Work Performed": "Fecha en que se hizo el trabajo",
  "Exchange / Work Order Number": "Central / número de orden de trabajo",
  "Project Number": "Número de proyecto",
  "Subcontractor Approval Signature": "Firma de aprobación del subcontratista",
  "Subcontractor Employee Name": "Nombre del empleado del subcontratista",
  "Supervisor Approval Signature": "Firma de aprobación del supervisor",
  "Work Order Title / Job Name": "Título de la orden / nombre de la obra",
  "— required": "— obligatorio",

  // ── Common ───────────────────────────────────────────────────────
  Save: "Guardar",
  Saving: "Guardando",
  Saved: "Guardado",
  Cancel: "Cancelar",
  Close: "Cerrar",
  Back: "Atrás",
  Loading: "Cargando",
  Search: "Buscar",
  Yes: "Sí",
  No: "No",
  ft: "pies",
};

const DICTIONARIES: Record<Locale, Record<string, string>> = { en: {}, es: ES };

/**
 * A lookup for one locale.
 *
 * Returns the English source untouched when there is no translation, so a
 * half-translated screen reads as English rather than as broken.
 */
export function translator(locale: Locale) {
  const dict = DICTIONARIES[locale] ?? {};
  return function t(english: string): string {
    return dict[english] ?? english;
  };
}

export type T = ReturnType<typeof translator>;

/** How much of the dictionary a locale actually covers. Used by the tests. */
export function coverage(locale: Locale): number {
  return Object.keys(DICTIONARIES[locale] ?? {}).length;
}
