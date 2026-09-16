/**
 * The public site, in Spanish.
 *
 * Kept apart from the crew dictionary in `i18n.ts` because the two are written
 * for different readers and go stale at different rates. The crew dictionary is
 * labels on a form a foreman fills in at six in the morning; this is sales
 * prose that will be rewritten whenever the pitch changes. Mixing them would
 * mean every marketing edit churns the file the field depends on.
 *
 * Both are merged into one runtime dictionary in `i18n.ts`, so `t()` on the
 * server and `useT()` on the client each reach all of it without the caller
 * having to know which half a string came from.
 *
 * The same three rules as the English page apply, and the middle one is the
 * reason this is a translation and not a rewrite:
 *
 *   No claim gets stronger in Spanish. Where the English hedges — "not
 *   available today", "figures are an illustration" — the Spanish hedges in the
 *   same place. A translation is where an honest page quietly stops being one.
 *
 * What is deliberately left in English:
 *
 *   Proper nouns. Vantara IQ, and the invented companies and job numbers in the
 *   mockups. A drawn screen showing "Keener Rd" is showing what a US street
 *   looks like in the product.
 *
 *   Trade words the crews themselves use in English on site in the US
 *   Southeast — redline, as-built, 811 — kept with the Spanish alongside on
 *   first use rather than replaced by a word nobody says.
 *
 *   Money and unit codes, for the reason given in `i18n.ts`: they are US
 *   dollars against a US contract and the codes are the customer's own.
 *
 * Latin American Spanish, since that is who is on these crews.
 */

export const MARKETING_ES: Record<string, string> = {
  // ── The browser tab and the link preview ─────────────────────────
  // The search keywords beside these deliberately stay English: a crawler
  // arrives with no cookie and reads the English page.
  "Vantara IQ — the operating system for infrastructure construction":
    "Vantara IQ — el sistema operativo para la construcción de infraestructura",
  "Construction operations software for telecom, fibre, power, gas, water and civil contractors. Digital dailies, redlines and as-builts, 811 locate management, material custody, subcontractor management and pay, automated billing and project margin — connected in one platform.":
    "Software de operaciones de construcción para contratistas de telecomunicaciones, fibra, energía, gas, agua y obra civil. Reportes diarios digitales, redlines y planos finales, manejo de localizaciones del 811, custodia de materiales, administración y pago de subcontratistas, facturación automática y margen del proyecto — todo conectado en una sola plataforma.",

  // ── Header and hero ──────────────────────────────────────────────
  Platform: "Plataforma",
  AI: "IA",
  Industries: "Sectores",
  Pricing: "Precios",
  "Sign in": "Iniciar sesión",
  "Request a demo": "Solicitar una demostración",
  "Built for infrastructure contractors": "Hecho para contratistas de infraestructura",
  "The operating system for infrastructure construction":
    "El sistema operativo para la construcción de infraestructura",
  "Vantara IQ connects your projects, crews, dailies, redlines, locates, materials, billing, subcontractors and financial intelligence in one platform.":
    "Vantara IQ conecta sus proyectos, cuadrillas, reportes diarios, redlines, localizaciones, materiales, facturación, subcontratistas e inteligencia financiera en una sola plataforma.",
  "From underground and aerial fibre to power, gas, water and civil infrastructure — know exactly what is happening across your operation.":
    "De fibra subterránea y aérea a energía, gas, agua e infraestructura civil: sepa exactamente qué está pasando en toda su operación.",
  "Explore the platform": "Conozca la plataforma",
  Underground: "Subterráneo",
  Aerial: "Aéreo",
  Fibre: "Fibra",
  Telecom: "Telecomunicaciones",
  Power: "Energía",
  Water: "Agua",
  Civil: "Civil",

  // ── The lifecycle ────────────────────────────────────────────────
  "One system. From field production to financial performance.":
    "Un solo sistema. De la producción en campo al desempeño financiero.",
  "Most infrastructure contractors run on paper dailies, PDFs, spreadsheets, text messages, an 811 portal, accounting software, a separate inventory list, rate sheets, engineering maps and subcontractor invoices. Every handoff between them is somewhere a number gets retyped, and every retyped number is somewhere the story stops matching.":
    "La mayoría de los contratistas de infraestructura trabajan con reportes en papel, PDFs, hojas de cálculo, mensajes de texto, un portal del 811, un sistema contable, una lista de inventario aparte, tarifarios, planos de ingeniería y facturas de subcontratistas. Cada paso de uno a otro es un lugar donde alguien vuelve a teclear un número, y cada número vuelto a teclear es un lugar donde las cuentas dejan de coincidir.",
  "Win it": "Ganarla",
  "Plan it": "Planearla",
  "Build it": "Construirla",
  "Get paid": "Cobrar",
  "Know where you stand": "Saber cómo va",
  Opportunity: "Oportunidad",
  Estimate: "Estimación",
  Award: "Adjudicación",
  Engineering: "Ingeniería",
  Locates: "Localizaciones",
  "Redline / as-built": "Redline / plano final (as-built)",
  Approval: "Aprobación",
  "Customer billing": "Facturación al cliente",
  "Subcontractor pay": "Pago al subcontratista",
  Retainage: "Retención",
  "Project margin": "Margen del proyecto",
  "Executive intelligence": "Inteligencia ejecutiva",
  "Each step feeds the next. The footage a crew files becomes the invoice to your customer, the crew’s own pay statement and the project’s margin — off one filing, at each side’s own rate card, with a trail back from any figure to the daily it came from.":
    "Cada paso alimenta al siguiente. Los pies que reporta una cuadrilla se convierten en la factura a su cliente, en el estado de pago de esa misma cuadrilla y en el margen del proyecto — de un solo reporte, cada lado con su propio tarifario, y con el rastro de cualquier cifra de vuelta al reporte del que salió.",

  // ── The assistant ────────────────────────────────────────────────
  "Ask your operation anything.": "Pregúntele lo que sea a su operación.",
  "Your operational data should not just sit in a database. Ask it what happened today, which projects are behind, which crews have not filed, what is ready to bill — and get an answer built from your own records rather than a guess.":
    "Los datos de su operación no deberían quedarse guardados en una base de datos. Pregunte qué pasó hoy, qué proyectos van atrasados, qué cuadrillas no han reportado, qué está listo para facturar — y reciba una respuesta armada con sus propios registros, no una suposición.",
  "Which projects are behind, and by how much?":
    "¿Qué proyectos van atrasados, y por cuánto?",
  "Which crews haven't submitted their dailies?":
    "¿Qué cuadrillas no han entregado sus reportes diarios?",
  "How many feet did we install this week?":
    "¿Cuántos pies instalamos esta semana?",
  "Which locates are holding up production?":
    "¿Qué localizaciones están frenando la producción?",
  "What's ready to bill right now?": "¿Qué está listo para facturar ahora mismo?",
  "It answers from the records it is given and says when it has none. It will not call a street clear because the sentence would read better that way.":
    "Responde con los registros que tiene y avisa cuando no tiene ninguno. No va a decir que una calle está libre solo porque la frase quedaría mejor así.",

  // ── Operations Center ────────────────────────────────────────────
  "Your entire operation. One screen.": "Toda su operación. Una sola pantalla.",
  "Production today, this week and this month. What is approved and ready to bill. Which projects are behind, which locates are blocking crews, which dailies never arrived. Then drill from the company down to a market, a project, a crew, a day, a single line of production.":
    "La producción de hoy, de esta semana y de este mes. Lo aprobado y listo para facturar. Qué proyectos van atrasados, qué localizaciones tienen detenidas a las cuadrillas, qué reportes nunca llegaron. Y de ahí baje de la empresa a un mercado, a un proyecto, a una cuadrilla, a un día, a una sola partida de producción.",
  Level: "Nivel",
  Company: "Empresa",
  "Every market, every project, one figure": "Todos los mercados y proyectos en una cifra",
  "How a region is performing against target": "Cómo va una región contra su meta",
  "Rates, crews, margin, documents, locates":
    "Tarifas, cuadrillas, margen, documentos, localizaciones",
  "Crew · Daily · Line": "Cuadrilla · Reporte · Partida",
  "Down to the individual production item": "Hasta la partida de producción individual",

  // ── One daily drives everything ──────────────────────────────────
  "One daily drives the entire workflow.": "Un reporte diario mueve todo el proceso.",
  "A crew files production from the truck with the redlined map and the photos attached. A supervisor reviews it. From that one approval comes the customer invoice, the crew’s pay statement, the retainage held on both sides, and the project’s margin.":
    "Una cuadrilla reporta la producción desde la troca con el plano marcado y las fotos adjuntas. Un supervisor lo revisa. De esa sola aprobación salen la factura al cliente, el estado de pago de la cuadrilla, la retención de ambos lados y el margen del proyecto.",
  "Filed from the truck, not the office": "Se llena desde la troca, no desde la oficina",
  "Big targets, little typing, photographs first. A foreman opens the job, enters what went in the ground, marks the map, attaches the photos and submits — in the time it takes to finish a coffee.":
    "Botones grandes, poco que teclear, las fotos primero. El capataz abre la obra, anota lo que quedó en el suelo, marca el plano, adjunta las fotos y lo envía — en lo que se acaba un café.",
  "And if a locate the crew is responsible for has not been signed off, the sheet says so before they start, not after.":
    "Y si falta firmar una localización que le toca a la cuadrilla, la hoja lo dice antes de que empiecen, no después.",

  // ── Tasks ────────────────────────────────────────────────────────
  "When something is wrong in the field, one person owns it.":
    "Cuando algo sale mal en campo, una sola persona responde por ello.",
  "A pedestal that never went in. A handhole left open. A redline nobody sent. Raise it against the job with a photograph of what you found, put one name on it, and the foreman gets a text where he is standing.":
    "Un pedestal que nunca se puso. Un registro que quedó abierto. Un redline que nadie mandó. Levántelo contra la obra con una foto de lo que encontró, póngale un nombre, y al capataz le llega un mensaje de texto donde esté parado.",
  "The photograph of the fault, and the photograph of the fix":
    "La foto de la falla, y la foto del arreglo",
  "Held as two different things and shown side by side. It settles an argument words never will.":
    "Se guardan como dos cosas distintas y se muestran lado a lado. Cierra una discusión que con palabras no se cierra.",
  "One owner, never two": "Un responsable, nunca dos",
  "An employee or a crew — the system refuses both, so nobody can assume the other one had it.":
    "Un empleado o una cuadrilla — el sistema no acepta los dos, para que nadie dé por hecho que el otro se estaba encargando.",
  "A text, not an email nobody opens": "Un mensaje de texto, no un correo que nadie abre",
  "Sent the moment it is assigned, to the company number and to every person the crew has invited.":
    "Se manda en cuanto se asigna, al número de la empresa y a cada persona que la cuadrilla haya dado de alta.",
  "The conversation lives on the job": "La conversación se queda en la obra",
  "Office and field talking in one thread against the project, not in somebody's phone.":
    "Oficina y campo hablando en un solo hilo dentro del proyecto, no en el celular de alguien.",
  "Blocked needs a reason": "Detenido exige un motivo",
  "You cannot park a task without saying what it is waiting on.":
    "No se puede dejar una tarea parada sin decir qué está esperando.",
  "Crews see only their own": "Cada cuadrilla ve solo lo suyo",
  "Scoped in the query. One crew cannot read another crew's problems.":
    "Se limita en la consulta misma. Una cuadrilla no puede leer los problemas de otra.",
  "Every task stays on that project’s record, so the punch list at closeout is the list of what was actually raised and what was actually done about it.":
    "Cada tarea queda en el expediente de ese proyecto, así que la lista de pendientes al cierre es la lista de lo que de verdad se levantó y de lo que de verdad se hizo al respecto.",

  // ── Locates ──────────────────────────────────────────────────────
  "Know before you dig.": "Sepa antes de excavar.",
  "Every 811 ticket with its clock, every utility’s response, and the one distinction that matters most: a ticket can be entirely clear with 811 and still not safe to open the ground, because the locate on your own plant has not been walked.":
    "Cada ticket del 811 con su reloj, la respuesta de cada compañía de servicios, y la distinción que más importa: un ticket puede estar totalmente libre con el 811 y aun así no ser seguro abrir el suelo, porque nadie ha caminado la localización de su propia planta.",
  "Expiring soon": "Por vencer",
  "Response pending": "Falta respuesta",
  "Re-mark required": "Requiere volver a marcar",
  "Your locate required": "Falta su propia localización",
  "Ready to excavate": "Listo para excavar",
  "Who performs which locate is set per project, so a utility your own crews walk stops holding up the ticket and starts holding up the dig — which is the truthful way round.":
    "Quién hace cada localización se define por proyecto, así que un servicio que caminan sus propias cuadrillas deja de frenar el ticket y pasa a frenar la excavación — que es como realmente es.",

  // ── Materials ────────────────────────────────────────────────────
  "Know where every reel went.": "Sepa a dónde fue cada carrete.",
  "Receiving, yard, checkout, crew, project, installed. Fibre reels by number, conduit, vaults, handholes, pedestals, hardware — held by yard, so a reel in one yard is never confused with one three counties away.":
    "Recibo, patio, salida, cuadrilla, proyecto, instalado. Carretes de fibra por número, ducto, bóvedas, registros, pedestales, herrajes — llevados por patio, para que un carrete de un patio nunca se confunda con otro a tres condados de distancia.",
  "What was issued against what the dailies say went in the ground, with a tolerance. A variance outside it is raised with a reason attached rather than quietly written off.":
    "Lo que se entregó contra lo que los reportes diarios dicen que quedó en el suelo, con una tolerancia. Una diferencia fuera de ella se levanta con un motivo adjunto, no se borra en silencio.",

  // ── Subcontractors ───────────────────────────────────────────────
  "Manage every subcontractor without losing control of your numbers.":
    "Administre a cada subcontratista sin perder el control de sus números.",
  "W-9, insurance, signed agreements, ACH and yard badges, chased by the system until the file is complete — a crew cannot be assigned work until it is. The packet stays on your side of the fence: you hold the record, not a folder on somebody’s laptop.":
    "W-9, seguros, contratos firmados, ACH y credenciales de patio, que el sistema persigue hasta completar el expediente — a una cuadrilla no se le puede asignar trabajo hasta que esté completo. El paquete se queda de su lado: el registro lo tiene usted, no una carpeta en la computadora de alguien.",
  "Every crew gets a login of their own": "Cada cuadrilla tiene su propio acceso",
  "Assign them a project and they work inside it — which is what stops your office re-typing what they have already written down.":
    "Asígneles un proyecto y trabajan dentro de él — que es justo lo que evita que su oficina vuelva a teclear lo que ellos ya escribieron.",
  "File their own dailies": "Entregan sus propios reportes diarios",
  "Production on your customer's form, from the truck.":
    "Producción en el formulario de su cliente, desde la troca.",
  "Redline the map and attach the as-built":
    "Marcan el plano y adjuntan el plano final (as-built)",
  "Marked on the job's own map, tied to that day's production.":
    "Marcado en el plano de la obra, ligado a la producción de ese día.",
  "Check and accept their statement": "Revisan y aceptan su estado de pago",
  "Or dispute it with a reason, which comes back to your office.":
    "O lo disputan con un motivo, que llega de vuelta a su oficina.",
  "Take the remittance advice": "Descargan su comprobante de pago",
  "Their own payment record, downloadable, nobody else's.":
    "Su propio historial de pagos, descargable, de nadie más.",
  "Invite their own people": "Dan de alta a su propia gente",
  "Owner, office admin, project manager, supervisor, foreman — each with their own access.":
    "Dueño, administración, gerente de proyecto, supervisor, capataz — cada uno con su propio acceso.",
  "Send in their locate tickets": "Mandan sus tickets de localización",
  "Filed to their company, and they see the clock on each one.":
    "Quedan archivados a su empresa, y ven el reloj de cada uno.",
  "What a subcontractor sees": "Lo que ve un subcontratista",
  "Their own crews, projects and dailies":
    "Sus propias cuadrillas, proyectos y reportes diarios",
  "Their own pay statements and retainage": "Sus propios estados de pago y retenciones",
  "Their own documents and compliance dates":
    "Sus propios documentos y fechas de vigencia",
  "Locate tickets filed to their company":
    "Los tickets de localización archivados a su empresa",
  "What they never see": "Lo que nunca ven",
  "What you bill your customer": "Lo que usted le factura a su cliente",
  "Your margin on any job": "Su margen en cualquier obra",
  "Any other subcontractor's work or pay":
    "El trabajo o el pago de cualquier otro subcontratista",
  "Rate cards that are not their own": "Tarifarios que no son el suyo",
  "Enforced in the queries that fetch the data, not by hiding a button.":
    "Se aplica en las consultas que traen los datos, no escondiendo un botón.",

  // ── Pipeline ─────────────────────────────────────────────────────
  "The work you are chasing, and the crews who could build it.":
    "El trabajo que anda buscando, y las cuadrillas que podrían construirlo.",
  "Winning the job and being able to staff it are two different problems, and most contractors track them in two different places — a bid list in a spreadsheet, and the crews in somebody’s head. Vantara IQ keeps both, because the second decides whether you should bid the first.":
    "Ganar la obra y poder dotarla de gente son dos problemas distintos, y la mayoría de los contratistas los llevan en dos lugares distintos — las licitaciones en una hoja de cálculo y las cuadrillas en la cabeza de alguien. Vantara IQ lleva los dos, porque el segundo decide si conviene entrarle al primero.",
  "Customers and bids": "Clientes y licitaciones",
  "Primes and customers you are working on, each opportunity with its market, estimated value, probability, bid date and expected award — moving from identified through estimating and bid submitted to awarded or lost. An awarded one becomes a project rather than being typed in again.":
    "Contratistas principales y clientes que está trabajando, cada oportunidad con su mercado, valor estimado, probabilidad, fecha de licitación y adjudicación esperada — pasando de identificada a estimación, a propuesta entregada, y a ganada o perdida. Una ganada se convierte en proyecto en vez de volverse a capturar.",
  "Subcontractors, and what they can actually do":
    "Subcontratistas, y lo que de verdad pueden hacer",
  "Not a contact list. What machines they own or rent, which trades they run and at what production, how many crews are free and from when, the markets they will travel to, their rates, their references, and how much of the prequalification file is in.":
    "No es una lista de contactos. Qué máquinas tienen o rentan, qué oficios manejan y a qué producción, cuántas cuadrillas están libres y desde cuándo, a qué mercados están dispuestos a viajar, sus tarifas, sus referencias, y cuánto llevan del expediente de precalificación.",
  "Availability is kept as a history rather than overwritten, because “committed through the 20th”, said in August, is what tells you in September that they are free.":
    "La disponibilidad se guarda como historial en vez de sobrescribirse, porque un “comprometidos hasta el 20” dicho en agosto es justo lo que en septiembre le dice que ya están libres.",
  "A score you can argue with": "Una calificación que se puede discutir",
  "Every part of it comes back with the sentence that produced it — 16 of 20 on equipment because there is no vac trailer. Missing information costs points and is called unknown, never unsuitable.":
    "Cada parte viene con la frase que la produjo — 16 de 20 en equipo porque no hay camión de vacío. La información que falta cuesta puntos y se llama desconocida, nunca inadecuada.",
  "A follow-up is a real task": "Un seguimiento es una tarea de verdad",
  "Set one and it raises a task owned by somebody, not a note in a box nobody opens.":
    "Póngalo y se levanta una tarea con un responsable, no una nota en una casilla que nadie abre.",
  "Ready ones become subcontractors": "Los que ya están listos pasan a subcontratistas",
  "Convert a crew and their contacts, equipment and rates carry across. It refuses to create a duplicate of a company you already work with.":
    "Convierta una cuadrilla y sus contactos, equipo y tarifas pasan con ella. Se niega a crear un duplicado de una empresa con la que ya trabaja.",

  // ── Everything else it does ──────────────────────────────────────
  "Everything else it does": "Todo lo demás que hace",
  "Production on your customer's own form, with redlines and photos attached.":
    "Producción en el formulario propio de su cliente, con redlines y fotos adjuntas.",
  "Redlines & as-builts": "Redlines y planos finales (as-builts)",
  "Engineering prints, field markups and as-builts tied to the daily and the billing.":
    "Planos de ingeniería, marcas de campo y planos finales ligados al reporte diario y a la facturación.",
  "Print reading": "Lectura de planos",
  "Count bores, handholes, pedestals and footages off an engineering print instead of by eye across twenty sheets.":
    "Cuente perforaciones, registros, pedestales y pies desde un plano de ingeniería en vez de a ojo entre veinte hojas.",
  Billing: "Facturación",
  "Approved production to customer invoice, with the trail back to the daily it came from.":
    "De la producción aprobada a la factura al cliente, con el rastro de vuelta al reporte del que salió.",
  Subcontractors: "Subcontratistas",
  "Onboarding, compliance, rate cards, statements, retainage and disputes.":
    "Alta, cumplimiento, tarifarios, estados de pago, retenciones y disputas.",
  "Financial intelligence": "Inteligencia financiera",
  "Revenue, subcontractor cost and production spread by project and market.":
    "Ingresos, costo de subcontratistas y margen de producción por proyecto y mercado.",
  Messaging: "Mensajería",
  "Assignments, approvals and pay notices reaching a foreman by text, with consent handled to carrier rules.":
    "Asignaciones, aprobaciones y avisos de pago que le llegan al capataz por mensaje de texto, con el consentimiento manejado según las reglas de las operadoras.",
  "Contracts, COIs, W-9s, permits and as-builts filed against the company or project they belong to.":
    "Contratos, certificados de seguro, W-9, permisos y planos finales archivados en la empresa o el proyecto al que pertenecen.",
  Pipeline: "Cartera de trabajo",
  "Opportunities, estimates and bids before a project exists — awarded ones become projects.":
    "Oportunidades, estimaciones y licitaciones antes de que exista un proyecto — las ganadas se vuelven proyectos.",
  "The job's own record": "El expediente de la obra",
  "Aerials, field photographs, the engineering map and every document filed against the project they belong to — not a shared drive.":
    "Fotos aéreas, fotos de campo, el plano de ingeniería y cada documento archivado en el proyecto al que pertenecen — no en una carpeta compartida.",
  "Rate sheets in one click": "Tarifarios con un clic",
  "A priced rate sheet for a project or a crew, generated as a PDF with your company's logo on it, from the rates already on file.":
    "Un tarifario con precios para un proyecto o una cuadrilla, generado en PDF con el logo de su empresa, a partir de las tarifas que ya tiene cargadas.",

  // ── Who it is for ────────────────────────────────────────────────
  "Who it is for": "Para quién es",
  "Whether you run two crews or two hundred, in one market or across several states.":
    "Ya sea que maneje dos cuadrillas o doscientas, en un mercado o en varios estados.",
  "Telecom & broadband": "Telecomunicaciones y banda ancha",
  "FTTH, backbone, middle-mile and last-mile. Underground, aerial and splicing.":
    "FTTH, troncal, milla intermedia y última milla. Subterráneo, aéreo y empalme.",
  "Electric utilities": "Compañías eléctricas",
  "Underground and overhead electrical infrastructure.":
    "Infraestructura eléctrica subterránea y aérea.",
  "Gas utilities": "Compañías de gas",
  "Distribution and mainline construction.": "Construcción de distribución y línea principal.",
  "Water & sewer": "Agua y drenaje",
  "Water, sewer and civil utility projects.":
    "Proyectos de agua, drenaje y obra civil de servicios.",
  "Civil infrastructure": "Infraestructura civil",
  "Contractors running multiple crews, subcontractors and markets.":
    "Contratistas que manejan varias cuadrillas, subcontratistas y mercados.",
  "Prime contractors": "Contratistas principales",
  "Central operational control across every subcontractor and project.":
    "Control operativo central sobre cada subcontratista y cada proyecto.",

  // ── The difference ───────────────────────────────────────────────
  "Most construction software records what happened.":
    "Casi todo el software de construcción registra lo que ya pasó.",
  "Vantara IQ tells you what needs you now.":
    "Vantara IQ le dice qué lo necesita ahora.",
  "Run on separate systems": "Con sistemas separados",
  "Dailies in one place, maps in another": "Los reportes en un lado, los planos en otro",
  "Locates in a portal nobody checks daily":
    "Las localizaciones en un portal que nadie revisa a diario",
  "Inventory on a spreadsheet": "El inventario en una hoja de cálculo",
  "Subcontractor pay worked out by hand": "El pago al subcontratista sacado a mano",
  "Billing reconciled at month end": "La facturación cuadrada a fin de mes",
  "Management assembles the story afterwards":
    "La dirección arma la historia después",
  "Run on Vantara IQ": "Con Vantara IQ",
  "One filing feeds billing, pay and margin":
    "Un solo reporte alimenta facturación, pago y margen",
  "Locates on the crew's own sheet before they dig":
    "Las localizaciones en la hoja de la cuadrilla antes de excavar",
  "Material custody by reel, crew and yard":
    "Custodia del material por carrete, cuadrilla y patio",
  "Statements calculated at each crew's own rates":
    "Estados de pago calculados con las tarifas de cada cuadrilla",
  "What is ready to bill, today": "Lo que está listo para facturar, hoy",
  "The exceptions come to you": "Las excepciones le llegan solas",
  "Management by exception instead of management by spreadsheet.":
    "Dirigir por excepción en vez de dirigir por hoja de cálculo.",

  // ── Security ─────────────────────────────────────────────────────
  "Your numbers stay yours": "Sus números siguen siendo suyos",
  "Your own system": "Su propio sistema",
  "A dedicated database and deployment per company. Nothing you enter is visible to another contractor.":
    "Una base de datos y una instalación dedicadas por empresa. Nada de lo que usted captura es visible para otro contratista.",
  "Role-based access": "Acceso por rol",
  "Owner, project manager, supervisor, foreman, inventory, office, subcontractor — each sees what their job needs.":
    "Dueño, gerente de proyecto, supervisor, capataz, almacén, oficina, subcontratista — cada quien ve lo que su trabajo necesita.",
  "Rates and margin protected": "Tarifas y margen protegidos",
  "What you bill and what you pay are separate figures with separate permissions.":
    "Lo que usted factura y lo que paga son cifras distintas con permisos distintos.",
  Auditable: "Auditable",
  "Every approval, rate change and payment carries who did it and when.":
    "Cada aprobación, cambio de tarifa y pago lleva quién lo hizo y cuándo.",
  "We do not claim a security certification we have not been through. What is described here is how the software is built, and we will walk you through any of it.":
    "No decimos tener una certificación de seguridad por la que no hemos pasado. Lo que se describe aquí es cómo está construido el software, y se lo explicamos punto por punto cuando quiera.",

  // ── What is not built ────────────────────────────────────────────
  "Being built next — not available today":
    "En construcción — todavía no disponible",
  "Named here so nobody buys on a promise. If one of these decides it for you, say so in the demo and we will tell you honestly where it stands.":
    "Los nombramos aquí para que nadie compre por una promesa. Si alguno de estos es lo que define su decisión, dígalo en la demostración y le decimos con honestidad en qué punto va.",
  "Task acknowledgement, office verification & rework":
    "Acuse de tareas, verificación de oficina y retrabajo",
  "Equipment & fleet": "Equipo y flotilla",
  "Safety, JSAs & incident reporting": "Seguridad, análisis de riesgos y reporte de incidentes",
  "Customer portal": "Portal del cliente",
  "Reading a material label from a photograph":
    "Leer la etiqueta de un material desde una foto",

  // ── Pricing ──────────────────────────────────────────────────────
  "One package. No tiers to work out.": "Un solo paquete. Sin niveles que descifrar.",
  "Your company runs on its own dedicated system — your database, your jobs, your rates. Nothing you put in is visible to any other contractor using Vantara IQ.":
    "Su empresa trabaja en su propio sistema dedicado — su base de datos, sus obras, sus tarifas. Nada de lo que usted captura es visible para ningún otro contratista que use Vantara IQ.",
  once: "pago único",
  Implementation: "Implementación",
  "Your own system, stood up and configured — rate cards loaded, crews and projects brought across, your people trained on it.":
    "Su propio sistema, montado y configurado — tarifarios cargados, cuadrillas y proyectos migrados, y su gente capacitada.",
  "per month": "al mes",
  "Enterprise package": "Paquete empresarial",
  "The whole platform. Every module, unlimited projects, unlimited subcontractor crews, and their logins are free.":
    "La plataforma completa. Todos los módulos, proyectos ilimitados, cuadrillas de subcontratistas ilimitadas, y sus accesos no se cobran.",
  "per user, per month": "por usuario, al mes",
  "Your staff": "Su personal",
  "Each of your own people with a login — owners, project managers, supervisors, foremen. Your subcontractors' logins are not charged.":
    "Cada persona suya con acceso — dueños, gerentes de proyecto, supervisores, capataces. Los accesos de sus subcontratistas no se cobran.",
  "What that includes": "Qué incluye",
  "Your own isolated database and deployment":
    "Su propia base de datos e instalación aisladas",
  "Unlimited subcontractor crews and their logins":
    "Cuadrillas de subcontratistas ilimitadas, con sus accesos",
  "Unlimited projects, dailies and invoices":
    "Proyectos, reportes diarios y facturas ilimitados",
  "Text alerts to crews, carrier-registered":
    "Alertas por mensaje de texto a las cuadrillas, registradas ante las operadoras",
  "Customer rate cards and per-crew pay rates":
    "Tarifarios de cliente y tarifas de pago por cuadrilla",
  "Locates, materials, documents and onboarding":
    "Localizaciones, materiales, documentos y alta de subcontratistas",

  // ── The demo ─────────────────────────────────────────────────────
  "Run your entire infrastructure operation from one platform.":
    "Maneje toda su operación de infraestructura desde una sola plataforma.",
  "Projects. Crews. Dailies. Redlines. Locates. Materials. Billing. Subcontractors. Financials. Vantara IQ connects the field to the office and turns operational data into decisions.":
    "Proyectos. Cuadrillas. Reportes diarios. Redlines. Localizaciones. Materiales. Facturación. Subcontratistas. Finanzas. Vantara IQ conecta el campo con la oficina y convierte los datos de la operación en decisiones.",
  "See it on your own jobs": "Véalo con sus propias obras",
  "Half an hour, walked through with one of your live jobs in front of us — your customer, your crews, your rates. You will know inside ten minutes whether it fits how you work.":
    "Media hora, recorriéndolo con una de sus obras activas enfrente — su cliente, sus cuadrillas, sus tarifas. En diez minutos va a saber si le acomoda a su forma de trabajar.",
  "No obligation and no card": "Sin compromiso y sin tarjeta",
  "We use your real job numbers, not a sample":
    "Usamos los números de sus obras reales, no un ejemplo",
  "Your data stays yours, on your own system":
    "Sus datos siguen siendo suyos, en su propio sistema",

  // ── The form ─────────────────────────────────────────────────────
  "Your name": "Su nombre",
  Email: "Correo electrónico",
  Mobile: "Celular",
  "Your role": "Su puesto",
  "Owner, operations manager…": "Dueño, gerente de operaciones…",
  "Crews you run": "Cuadrillas que maneja",
  "Anything we should know": "Algo que debamos saber",
  "What you run on today, and what is not working about it.":
    "Con qué trabaja hoy, y qué no le está funcionando.",
  "Book a demo": "Agendar una demostración",
  "We use this to arrange the demonstration and nothing else. No list, no newsletter, and we do not pass it on.":
    "Usamos esto para agendar la demostración y para nada más. Sin listas, sin boletines, y no se lo pasamos a nadie.",
  "That’s with us.": "Ya lo recibimos.",
  "We’ll be in touch to arrange a time, usually the same day. If it’s urgent, call":
    "Nos comunicamos para acordar una hora, normalmente el mismo día. Si es urgente, llame al",
  "Enter your name.": "Escriba su nombre.",
  "Enter your company.": "Escriba su empresa.",
  "Enter an email we can reply to.":
    "Escriba un correo al que podamos responderle.",

  // ── Footer ───────────────────────────────────────────────────────
  "Text message alerts": "Alertas por mensaje de texto",
  Privacy: "Privacidad",
  Terms: "Términos",

  // ── The drawn mockups ────────────────────────────────────────────
  // Chrome and labels only. The invented company names, streets, job
  // numbers, unit codes and dollar figures inside them stay as they are.
  "Active projects": "Proyectos activos",
  "3 markets": "3 mercados",
  "Installed this week": "Instalado esta semana",
  "linear feet": "pies lineales",
  "Ready to bill": "Listo para facturar",
  "approved production": "producción aprobada",
  "Est. gross margin": "Margen bruto est.",
  "production spread": "margen de producción",
  "Needs attention": "Requiere atención",
  "Locate expires today": "La localización vence hoy",
  "Daily missing": "Falta el reporte diario",
  "Project behind target": "Proyecto atrasado contra la meta",
  "Fibre reel low": "Carrete de fibra bajo",
  "Invoice ready": "Factura lista",
  "Project health": "Salud de los proyectos",
  "Pace Boring · Tuesday": "Pace Boring · martes",
  "GA-118 · 8% under": "GA-118 · 8% por debajo",
  "Bellwood yard · 2,400 ft left": "patio Bellwood · quedan 2,400 pies",
  "week ending 12 June": "semana que termina el 12 de junio",
  "What needs my attention right now?": "¿Qué necesita mi atención ahora mismo?",
  "Four things, worst first.": "Cuatro cosas, la peor primero.",
  "Locate 260904-001234 expires today":
    "La localización 260904-001234 vence hoy",
  "Keener Rd, ATL-204. Pace Boring is scheduled there tomorrow.":
    "Keener Rd, ATL-204. Pace Boring está programada ahí mañana.",
  "GA-118 is 8% behind target": "GA-118 va 8% atrasado contra la meta",
  "Needs 1,950 ft a day to finish on the contract date; running 1,790.":
    "Necesita 1,950 pies al día para terminar en la fecha del contrato; va en 1,790.",
  "Two dailies missing": "Faltan dos reportes diarios",
  "Pace Boring, Tuesday and Wednesday.": "Pace Boring, martes y miércoles.",
  "$184,250 ready to bill": "$184,250 listos para facturar",
  "Approved production across 3 projects, none invoiced yet.":
    "Producción aprobada en 3 proyectos, ninguno facturado todavía.",
  "Break down GA-118.": "Desglóseme GA-118.",
  "18,400 of 31,000 ft in the ground, 59% complete. Two crews on it. The slip started three weeks ago when Hollis moved to SC-072 and has not been made up since.":
    "18,400 de 31,000 pies en el suelo, 59% completo. Dos cuadrillas en él. El atraso empezó hace tres semanas cuando Hollis se movió a SC-072 y no se ha recuperado desde entonces.",
  "6 photos": "6 fotos",
  "Billed to customer": "Facturado al cliente",
  "Crew earns": "Gana la cuadrilla",
  "Production spread": "Margen de producción",
  "Retainage held": "Retención",
  "811 ready": "811 libre",
  "18d left": "18 d restantes",
  Clear: "Libre",
  Marked: "Marcado",
  "Your own plant": "Su propia planta",
  "Not walked yet": "Aún no se camina",
  "Every public utility has cleared. The locate this contractor performs on its own plant has not been signed off, so the crew’s own sheet says so before they break ground.":
    "Todas las compañías de servicios dieron libre. La localización que este contratista hace en su propia planta no está firmada, así que la hoja de la cuadrilla lo dice antes de romper suelo.",
  "On hand": "En existencia",
  "feet, 3 yards": "pies, 3 patios",
  "With crews": "Con las cuadrillas",
  "issued, not installed": "entregado, no instalado",
  Variance: "Diferencia",
  "over tolerance": "fuera de tolerancia",
  "Reel R-88142 · 144ct single mode": "Carrete R-88142 · 144 hilos monomodo",
  Received: "Recibido",
  Issued: "Entregado",
  Installed: "Instalado",
  Unaccounted: "Sin justificar",
  "Over tolerance": "Fuera de tolerancia",
  "Bellwood yard": "patio Bellwood",
  "From 3 dailies": "De 3 reportes diarios",
  "One approved daily, both sides of the book":
    "Un reporte diario aprobado, los dos lados del libro",
  "Billed to your customer": "Facturado a su cliente",
  "Paid to the crew": "Pagado a la cuadrilla",
  "What the job earns": "Lo que deja la obra",
  "Both numbers come off the same approved daily at each side’s own rate card, so the invoice and the crew’s statement cannot drift apart. Figures are an illustration.":
    "Las dos cifras salen del mismo reporte diario aprobado, cada lado con su propio tarifario, así que la factura y el estado de pago de la cuadrilla no se pueden separar. Las cifras son un ejemplo.",
  Qualified: "Calificado",
  Estimating: "En estimación",
  "Bid submitted": "Propuesta entregada",
  Awarded: "Ganado",
  Daily: "Reporte diario",
  "Pre-work required": "Falta trabajo previo",
  "Your own locate is not signed off on this street.":
    "Su propia localización no está firmada en esta calle.",
  "Plow 12.7 2W": "Arado 12.7 2W",
  "Road bore": "Perforación bajo camino",
  "Vault set": "Bóveda colocada",
  Photo: "Foto",
  Notes: "Notas",
  "Submit daily": "Enviar reporte",
  High: "Alta",
  "Pedestal 1847 not installed": "Pedestal 1847 sin instalar",
  "In progress": "En proceso",
  "Due today, 3:00 PM": "Vence hoy, 3:00 PM",
  Before: "Antes",
  After: "Después",
  "Reported 9:12 AM": "Reportado 9:12 AM",
  "Attached 1:47 PM": "Adjuntado 1:47 PM",
  Activity: "Actividad",
  Office: "Oficina",
  "Raised with photo, assigned to Crew 7":
    "Levantado con foto, asignado a la cuadrilla 7",
  "Texted the foreman": "Se mandó mensaje al capataz",
  "Heading back to the location now": "Voy de regreso al lugar ahora",
  "Need another pedestal from the yard": "Necesito otro pedestal del patio",
  "Materials on the way": "Los materiales van en camino",
  "Photo attached, marked done": "Foto adjunta, marcado como terminado",
  Prequalified: "Precalificado",
  Score: "Calificación",
  "3 crews free · available now · works GA, SC":
    "3 cuadrillas libres · disponible ya · trabaja GA, SC",
  "Why 78": "Por qué 78",
  Capacity: "Capacidad",
  "3 crews they say are free": "3 cuadrillas que dicen tener libres",
  Equipment: "Equipo",
  "2 drills, 1 plough, no vac trailer": "2 perforadoras, 1 arado, sin camión de vacío",
  "Market fit": "Encaje de mercado",
  "Works GA and SC": "Trabaja GA y SC",
  Availability: "Disponibilidad",
  "Free from the 4th": "Libre a partir del 4",
  Documentation: "Documentación",
  "W-9 in, insurance and references missing":
    "W-9 entregado, faltan seguro y referencias",
  "Rate fit": "Encaje de tarifa",
  "They have not quoted a rate": "No han cotizado una tarifa",
  "What they run": "Lo que manejan",
  "Directional drill": "Perforadora direccional",
  "2 owned": "2 propias",
  Plough: "Arado",
  "1 owned": "1 propio",
  "Vac trailer": "Camión de vacío",
  rented: "rentado",
  "Directional bore": "Perforación direccional",
  "900 ft/day": "900 pies/día",
  "2,400 ft/day": "2,400 pies/día",
  Splicing: "Empalme",
  occasional: "ocasional",
  // The window chrome on each mockup.
  "vantaraiq.com · operations": "vantaraiq.com · operaciones",
  "vantaraiq.com · assistant": "vantaraiq.com · asistente",
  "vantaraiq.com · dailies": "vantaraiq.com · reportes diarios",
  "vantaraiq.com · locates": "vantaraiq.com · localizaciones",
  "vantaraiq.com · materials": "vantaraiq.com · materiales",
  "vantaraiq.com · pipeline": "vantaraiq.com · cartera",
  "vantaraiq.com · tasks": "vantaraiq.com · tareas",
  "vantaraiq.com · prospects": "vantaraiq.com · prospectos",
};
