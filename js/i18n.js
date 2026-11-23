// Languages: English (the source), Spanish and Portuguese.
//
// Which language: ?lang=es or ?lang=pt in the address wins (for testing and
// direct links). Otherwise the guide looks at the site it is embedded in:
// gnbya.org's Wix translator serves Spanish at es.gnbya.org and Portuguese at
// pt.gnbya.org, and the browser tells an embedded page that address
// (document.referrer). Anything else is English.
//
// Interface wording is translated here by hand. Listing text (descriptions,
// dates, costs...) comes machine-translated from the sheet's translation
// tabs; see TRANSLATIONS in data.js. Filtering always uses the English
// originals, so a translation can never change which listings match.
const LANGS = ["en", "es", "pt"];

const LANG = (() => {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q && LANGS.includes(q.toLowerCase())) return q.toLowerCase();
  } catch (e) { /* old browser: fall through */ }
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    const m = host.match(/^(es|pt)\./i);
    if (m && /(^|\.)gnbya\.org$/i.test(host)) return m[1].toLowerCase();
  } catch (e) { /* no referrer */ }
  return "en";
})();

// English text -> translation. Keys are the exact English strings the page
// shows, so a missing entry simply stays in English.
const STRINGS = {
  es: {
    // Page
    "GNBYA Activities Guide": "Guía de Actividades de GNBYA",
    "Find a camp or program for your child": "Encuentre un campamento o programa para su hijo",
    "Dark mode": "Modo oscuro",
    "Getting started": "Para empezar",
    "Enter your child's age to hide programs they can't join.": "Elija la edad de su hijo para ocultar los programas en los que no puede participar.",
    "Use the filters for free spots, bus routes, or language support.": "Use los filtros para encontrar opciones gratuitas, rutas de autobús o apoyo en otros idiomas.",
    "Stuck? Email lead@gnbya.org for help choosing.": '¿Necesita ayuda? Escriba a <a href="mailto:lead@gnbya.org">lead@gnbya.org</a> y le ayudamos a elegir.',
    "Search camps, clubs, or organizations": "Buscar campamentos, clubes u organizaciones",
    "Search": "Buscar",
    "Filters": "Filtros",
    "Child's age": "Edad del niño",
    "Filter by age": "Filtrar por edad",
    "Any": "Todas",
    "Close filters": "Cerrar filtros",
    "Clear all": "Borrar todo",
    "Show": "Mostrar",
    "results": "resultados",
    "finished": "terminado",
    "These programs have already run. They stay here so you can see what each organization usually offers and ask about next summer — most open registration in the spring.":
      "Estos programas ya terminaron. Los dejamos aquí para que vea lo que suele ofrecer cada organización y pregunte por el próximo verano; la mayoría abre inscripciones en la primavera.",
    "See what’s running now →": "Ver lo que hay ahora →",
    "No matches for those filters": "No hay resultados con esos filtros",
    "Try widening the age range or clearing a filter.": "Pruebe con otra edad o quite algún filtro.",
    "Clear all filters": "Borrar todos los filtros",
    "Loading…": "Cargando…",
    "Need help choosing or applying? Email lead@gnbya.org.": '¿Necesita ayuda para elegir o inscribirse? Escriba a <a href="mailto:lead@gnbya.org">lead@gnbya.org</a>.',
    "Know a program we're missing? Tell us →": "¿Conoce un programa que no aparece? Cuéntenos →",
    "Listings updated weekly by participating organizations.": "Las organizaciones participantes actualizan los listados cada semana.",
    "For organizations →": "Para organizaciones →",
    "Listing details are translated automatically and may contain mistakes.": "Los detalles de cada listado se traducen automáticamente y pueden contener errores.",
    // Tabs and counts
    "Current Activities": "Actividades actuales",
    "GNBYA Organizations": "Organizaciones de GNBYA",
    "Summer Activities": "Actividades de verano",
    "Past": "Pasado",
    "activity": "actividad",
    "activities": "actividades",
    "organization": "organización",
    "organizations": "organizaciones",
    "Summer": "Verano",
    // Filters
    "Free": "Gratis",
    "Financial aid": "Ayuda financiera",
    "Bus accessible": "Accesible en autobús",
    "Language support": "Apoyo en otros idiomas",
    "After school": "Después de la escuela",
    "No application needed": "No requiere solicitud",
    "On a bus route": "En una ruta de autobús",
    "Program Year": "Época del año",
    "Program Model": "Tipo de programa",
    "Grade Levels": "Grados",
    "Cost": "Costo",
    "Registration": "Inscripción",
    "Transportation": "Transporte",
    "Type of activity": "Tipo de actividad",
    "When": "Cuándo",
    "More filters": "Más filtros",
    "Any dates": "Cualquier fecha",
    "Pick a day, then a second day for a range.": "Elija un día y luego otro para un rango de fechas.",
    "Pick a second day for a range, or leave it for one day.": "Elija un segundo día para un rango, o déjelo así para un solo día.",
    "Clear dates": "Borrar fechas",
    "Previous month": "Mes anterior",
    "Next month": "Mes siguiente",
    "running": "en curso",
    // Organization filter values (shown translated; filters still use English)
    "Full Year": "Todo el año",
    "Full Year With Limited Winter Programs": "Todo el año (menos en invierno)",
    "School Year": "Año escolar",
    "School Holidays/ Breaks": "Vacaciones escolares",
    "Before School": "Antes de la escuela",
    "After School": "Después de la escuela",
    "Full Day": "Día completo",
    "Partial Day": "Medio día",
    "Evening": "Por la tarde",
    "Weekend Only": "Solo fines de semana",
    "Summer Only": "Solo en verano",
    "Infant/Toddler": "Bebés y niños pequeños",
    "Pre-K": "Prekínder",
    "Elementary": "Primaria",
    "Middle": "Escuela intermedia",
    "High": "Escuela secundaria",
    "Out of School": "Fuera de la escuela",
    "All Ages": "Todas las edades",
    "Fee": "Con costo",
    "Financial Assistance": "Ayuda financiera",
    "Slide Scale Based on Income": "Tarifa según ingresos",
    "Accepts Child Care Subsidies": "Acepta subsidios de cuidado infantil",
    "Drop In": "Sin solicitud previa",
    "Application Required": "Requiere solicitud",
    "Restricted Access": "Acceso restringido",
    "Accessible From Public Transportation": "Accesible en transporte público",
    "Provided To Our Site": "Transporte hasta el centro",
    "Provided From Our Program Site To Home": "Transporte del centro a casa",
    "Care Infant and Toddler": "Cuidado de bebés y niños pequeños",
    "Care Preschool": "Cuidado preescolar",
    "Care School Age": "Cuidado para edad escolar",
    // Categories
    "📚 Homework & Tutoring": "📚 Tareas y tutoría",
    "🎨 Arts & Culture": "🎨 Arte y cultura",
    "🎵 Music": "🎵 Música",
    "🖌️ Art": "🖌️ Arte",
    "🎭 Theater": "🎭 Teatro",
    "🌍 Culture": "🌍 Cultura",
    "⚽ Sports & Recreation": "⚽ Deportes y recreación",
    "🔬 Science & Nature": "🔬 Ciencia y naturaleza",
    "💚 Health & Wellness": "💚 Salud y bienestar",
    "🤝 Mentoring & Leadership": "🤝 Mentoría y liderazgo",
    "💼 Jobs & Career Skills": "💼 Empleo y habilidades profesionales",
    "👶 Infant & Toddler Care": "👶 Cuidado de bebés",
    "🧸 Preschool Care": "🧸 Cuidado preescolar",
    "🎒 School-Age Care": "🎒 Cuidado para edad escolar",
    // Cards
    "Overview": "Resumen",
    "About": "Acerca de",
    "Where": "Dónde",
    "Contact": "Contacto",
    "Details": "Detalles",
    "Join": "Inscribirse",
    "Ages": "Edades",
    "Dates": "Fechas",
    "Hours": "Horario",
    "Schedule": "Horario",
    "All ages": "Todas las edades",
    "Year-round": "Todo el año",
    "Aid available": "Hay ayuda",
    "Not running this season": "No se ofrece esta temporada",
    "Session ended": "Sesión terminada",
    "Currently full": "Lleno por ahora",
    "School pickup": "Recogida en la escuela",
    "Free options": "Opciones gratuitas",
    "Address": "Dirección",
    "Getting there": "Cómo llegar",
    "Nearest bus stop": "Parada de autobús más cercana",
    "Near an SRTA bus route": "Cerca de una ruta de autobús de SRTA",
    "Picks kids up from school": "Recoge a los niños en la escuela",
    "Locations": "Ubicaciones",
    "Programs": "Programas",
    "Grades": "Grados",
    "Schools served": "Escuelas atendidas",
    "Cost options": "Opciones de costo",
    "Sign up": "Inscribirse",
    "Visit website": "Visitar sitio web",
    "Pause": "Pausa",
    "Play": "Seguir",
    "Scroll to read": "Desplácese para leer",
    // Empty and error states
    "No {items} listed yet": "Aún no hay {items}",
    "Nothing has been published in this section so far. The GNBYA Organizations tab lists programs that run year-round.":
      "Todavía no se ha publicado nada en esta sección. La pestaña Organizaciones de GNBYA muestra programas que funcionan todo el año.",
    "Nothing in the summer archive matches those filters. Try clearing one.": "Nada del archivo de verano coincide con esos filtros. Pruebe quitando uno.",
    "Sorry, we couldn't load programs right now. Please try again later.": "Lo sentimos, no pudimos cargar los programas. Inténtelo de nuevo más tarde.",
    "Sorry, we couldn't load organizations right now. Please try again later.": "Lo sentimos, no pudimos cargar las organizaciones. Inténtelo de nuevo más tarde.",
    // Partners page
    "For partner organizations · GNBYA Activities Guide": "Para organizaciones asociadas · Guía de Actividades de GNBYA",
    "For partner organizations": "Para organizaciones asociadas",
    "The GNBYA Activities Guide helps Greater New Bedford families find camps, programs and organizations for their kids, and every listing comes from partners like you.":
      "La Guía de Actividades de GNBYA ayuda a las familias de Greater New Bedford a encontrar campamentos, programas y organizaciones para sus hijos, y cada listado viene de organizaciones como la suya.",
    "Add or update your organization": "Agregue o actualice su organización",
    "New to the guide? Fill this in once. Already listed? Use the private link we emailed you.": "¿Es nuevo en la guía? Complete esto una vez. ¿Ya aparece? Use el enlace privado que le enviamos por correo.",
    "Add an activity": "Agregue una actividad",
    "List a program, camp or class, with its ages, dates and cost.": "Publique un programa, campamento o clase, con sus edades, fechas y costo.",
    "Lost your edit links?": "¿Perdió sus enlaces para editar?",
    "Enter your email and we'll send you the links to everything you manage.": "Escriba su correo y le enviaremos los enlaces de todo lo que administra.",
    "After you submit, we'll email you a private link to update your listing anytime.": "Después de enviarlo, le enviaremos por correo un enlace privado para actualizar su listado cuando quiera.",
    "← Back to the activities guide": "← Volver a la guía de actividades",
  },
  pt: {
    // Page
    "GNBYA Activities Guide": "Guia de Atividades da GNBYA",
    "Find a camp or program for your child": "Encontre um acampamento ou programa para seu filho",
    "Dark mode": "Modo escuro",
    "Getting started": "Para começar",
    "Enter your child's age to hide programs they can't join.": "Escolha a idade do seu filho para ocultar os programas dos quais ele não pode participar.",
    "Use the filters for free spots, bus routes, or language support.": "Use os filtros para encontrar opções gratuitas, linhas de ônibus ou apoio em outros idiomas.",
    "Stuck? Email lead@gnbya.org for help choosing.": 'Precisa de ajuda? Escreva para <a href="mailto:lead@gnbya.org">lead@gnbya.org</a> e ajudamos você a escolher.',
    "Search camps, clubs, or organizations": "Buscar acampamentos, clubes ou organizações",
    "Search": "Buscar",
    "Filters": "Filtros",
    "Child's age": "Idade da criança",
    "Filter by age": "Filtrar por idade",
    "Any": "Todas",
    "Close filters": "Fechar filtros",
    "Clear all": "Limpar tudo",
    "Show": "Mostrar",
    "results": "resultados",
    "finished": "encerrado",
    "These programs have already run. They stay here so you can see what each organization usually offers and ask about next summer — most open registration in the spring.":
      "Estes programas já terminaram. Eles continuam aqui para você ver o que cada organização costuma oferecer e perguntar sobre o próximo verão — a maioria abre inscrições na primavera.",
    "See what’s running now →": "Ver o que está acontecendo agora →",
    "No matches for those filters": "Nenhum resultado com esses filtros",
    "Try widening the age range or clearing a filter.": "Tente outra idade ou remova algum filtro.",
    "Clear all filters": "Limpar todos os filtros",
    "Loading…": "Carregando…",
    "Need help choosing or applying? Email lead@gnbya.org.": 'Precisa de ajuda para escolher ou se inscrever? Escreva para <a href="mailto:lead@gnbya.org">lead@gnbya.org</a>.',
    "Know a program we're missing? Tell us →": "Conhece um programa que não está aqui? Conte para nós →",
    "Listings updated weekly by participating organizations.": "As organizações participantes atualizam as listagens toda semana.",
    "For organizations →": "Para organizações →",
    "Listing details are translated automatically and may contain mistakes.": "Os detalhes de cada listagem são traduzidos automaticamente e podem conter erros.",
    // Tabs and counts
    "Current Activities": "Atividades atuais",
    "GNBYA Organizations": "Organizações da GNBYA",
    "Summer Activities": "Atividades de verão",
    "Past": "Passado",
    "activity": "atividade",
    "activities": "atividades",
    "organization": "organização",
    "organizations": "organizações",
    "Summer": "Verão",
    // Filters
    "Free": "Grátis",
    "Financial aid": "Ajuda financeira",
    "Bus accessible": "Acessível de ônibus",
    "Language support": "Apoio em outros idiomas",
    "After school": "Depois da escola",
    "No application needed": "Sem inscrição prévia",
    "On a bus route": "Em uma linha de ônibus",
    "Program Year": "Época do ano",
    "Program Model": "Tipo de programa",
    "Grade Levels": "Séries",
    "Cost": "Custo",
    "Registration": "Inscrição",
    "Transportation": "Transporte",
    "Type of activity": "Tipo de atividade",
    "When": "Quando",
    "More filters": "Mais filtros",
    "Any dates": "Qualquer data",
    "Pick a day, then a second day for a range.": "Escolha um dia e depois outro para um período.",
    "Pick a second day for a range, or leave it for one day.": "Escolha um segundo dia para um período ou deixe assim para um só dia.",
    "Clear dates": "Limpar datas",
    "Previous month": "Mês anterior",
    "Next month": "Próximo mês",
    "running": "acontecendo",
    // Organization filter values
    "Full Year": "Ano todo",
    "Full Year With Limited Winter Programs": "Ano todo (menos no inverno)",
    "School Year": "Ano letivo",
    "School Holidays/ Breaks": "Férias escolares",
    "Before School": "Antes da escola",
    "After School": "Depois da escola",
    "Full Day": "Dia inteiro",
    "Partial Day": "Meio período",
    "Evening": "À noite",
    "Weekend Only": "Só fins de semana",
    "Summer Only": "Só no verão",
    "Infant/Toddler": "Bebês e crianças pequenas",
    "Pre-K": "Pré-escola",
    "Elementary": "Ensino fundamental I",
    "Middle": "Ensino fundamental II",
    "High": "Ensino médio",
    "Out of School": "Fora da escola",
    "All Ages": "Todas as idades",
    "Fee": "Pago",
    "Financial Assistance": "Ajuda financeira",
    "Slide Scale Based on Income": "Valor conforme a renda",
    "Accepts Child Care Subsidies": "Aceita subsídios para creche",
    "Drop In": "Sem inscrição prévia",
    "Application Required": "Requer inscrição",
    "Restricted Access": "Acesso restrito",
    "Accessible From Public Transportation": "Acessível por transporte público",
    "Provided To Our Site": "Transporte até o local",
    "Provided From Our Program Site To Home": "Transporte do local para casa",
    "Care Infant and Toddler": "Cuidado de bebês e crianças pequenas",
    "Care Preschool": "Cuidado pré-escolar",
    "Care School Age": "Cuidado para idade escolar",
    // Categories
    "📚 Homework & Tutoring": "📚 Lição de casa e reforço",
    "🎨 Arts & Culture": "🎨 Arte e cultura",
    "🎵 Music": "🎵 Música",
    "🖌️ Art": "🖌️ Arte",
    "🎭 Theater": "🎭 Teatro",
    "🌍 Culture": "🌍 Cultura",
    "⚽ Sports & Recreation": "⚽ Esportes e recreação",
    "🔬 Science & Nature": "🔬 Ciência e natureza",
    "💚 Health & Wellness": "💚 Saúde e bem-estar",
    "🤝 Mentoring & Leadership": "🤝 Mentoria e liderança",
    "💼 Jobs & Career Skills": "💼 Trabalho e carreira",
    "👶 Infant & Toddler Care": "👶 Cuidado de bebês",
    "🧸 Preschool Care": "🧸 Cuidado pré-escolar",
    "🎒 School-Age Care": "🎒 Cuidado para idade escolar",
    // Cards
    "Overview": "Resumo",
    "About": "Sobre",
    "Where": "Onde",
    "Contact": "Contato",
    "Details": "Detalhes",
    "Join": "Inscrição",
    "Ages": "Idades",
    "Dates": "Datas",
    "Hours": "Horário",
    "Schedule": "Horário",
    "All ages": "Todas as idades",
    "Year-round": "Ano todo",
    "Aid available": "Com ajuda",
    "Not running this season": "Não acontece nesta temporada",
    "Session ended": "Sessão encerrada",
    "Currently full": "Lotado no momento",
    "School pickup": "Busca na escola",
    "Free options": "Opções gratuitas",
    "Address": "Endereço",
    "Getting there": "Como chegar",
    "Nearest bus stop": "Ponto de ônibus mais próximo",
    "Near an SRTA bus route": "Perto de uma linha de ônibus da SRTA",
    "Picks kids up from school": "Busca as crianças na escola",
    "Locations": "Locais",
    "Programs": "Programas",
    "Grades": "Séries",
    "Schools served": "Escolas atendidas",
    "Cost options": "Opções de custo",
    "Sign up": "Inscrever-se",
    "Visit website": "Visitar site",
    "Pause": "Pausar",
    "Play": "Continuar",
    "Scroll to read": "Role para ler",
    // Empty and error states
    "No {items} listed yet": "Ainda não há {items}",
    "Nothing has been published in this section so far. The GNBYA Organizations tab lists programs that run year-round.":
      "Nada foi publicado nesta seção ainda. A aba Organizações da GNBYA mostra programas que funcionam o ano todo.",
    "Nothing in the summer archive matches those filters. Try clearing one.": "Nada no arquivo de verão corresponde a esses filtros. Tente remover um.",
    "Sorry, we couldn't load programs right now. Please try again later.": "Desculpe, não conseguimos carregar os programas agora. Tente novamente mais tarde.",
    "Sorry, we couldn't load organizations right now. Please try again later.": "Desculpe, não conseguimos carregar as organizações agora. Tente novamente mais tarde.",
    // Partners page
    "For partner organizations · GNBYA Activities Guide": "Para organizações parceiras · Guia de Atividades da GNBYA",
    "For partner organizations": "Para organizações parceiras",
    "The GNBYA Activities Guide helps Greater New Bedford families find camps, programs and organizations for their kids, and every listing comes from partners like you.":
      "O Guia de Atividades da GNBYA ajuda as famílias da Grande New Bedford a encontrar acampamentos, programas e organizações para seus filhos, e cada listagem vem de parceiros como você.",
    "Add or update your organization": "Adicione ou atualize sua organização",
    "New to the guide? Fill this in once. Already listed? Use the private link we emailed you.": "Novo no guia? Preencha isto uma vez. Já está listado? Use o link particular que enviamos por e-mail.",
    "Add an activity": "Adicione uma atividade",
    "List a program, camp or class, with its ages, dates and cost.": "Publique um programa, acampamento ou aula, com idades, datas e custo.",
    "Lost your edit links?": "Perdeu seus links de edição?",
    "Enter your email and we'll send you the links to everything you manage.": "Digite seu e-mail e enviaremos os links de tudo o que você administra.",
    "After you submit, we'll email you a private link to update your listing anytime.": "Depois de enviar, mandaremos por e-mail um link particular para você atualizar sua listagem quando quiser.",
    "← Back to the activities guide": "← Voltar ao guia de atividades",
  },
};

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  pt: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
};
const DAY_LETTERS = {
  en: ["S", "M", "T", "W", "T", "F", "S"],
  es: ["D", "L", "M", "M", "J", "V", "S"],
  pt: ["D", "S", "T", "Q", "Q", "S", "S"],
};

// Translate one English string; untranslated text stays in English.
function t(text) {
  if (LANG === "en" || text == null) return text;
  const table = STRINGS[LANG];
  return Object.prototype.hasOwnProperty.call(table, text) ? table[text] : text;
}

// "6 activities" in the current language.
function countLabel(n, noun, nounPlural) {
  return `${n} ${t(n === 1 ? noun : nounPlural)}`;
}

// "Ages 5-13", "Ages 5+", "Up to age 13".
function agesLabel(min, max) {
  const word = { en: "Ages", es: "Edades", pt: "Idades" }[LANG];
  if (min != null && max != null) return `${word} ${min}-${max}`;
  if (min != null) return `${word} ${min}+`;
  return { en: `Up to age ${max}`, es: `Hasta ${max} años`, pt: `Até ${max} anos` }[LANG];
}

// Static page text: elements marked data-i18n take the translation of their
// own English text (data-i18n-html when the translation carries a link).
// data-i18n-attr="placeholder,aria-label" translates those attributes too.
// Links between the guide's own pages keep the language.
function translatePage() {
  document.documentElement.lang = LANG;
  if (LANG === "en") return;
  document.title = t(document.title);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n") || el.textContent.trim();
    if (el.hasAttribute("data-i18n-html")) el.innerHTML = t(key);
    else el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.getAttribute("data-i18n-attr").split(",").forEach((a) => {
      const v = el.getAttribute(a.trim());
      if (v) el.setAttribute(a.trim(), t(v));
    });
  });
  // The heading's words are separate spans for the page-load animation.
  const h = document.querySelector(".page-title[data-i18n-words]");
  if (h) {
    const words = t(h.getAttribute("data-i18n-words")).split(" ");
    h.innerHTML = words.map((w, i) => `<span class="tw" style="--w:${i}">${w}</span>`).join(" ");
  }
  document.querySelectorAll('a[href="partners.html"], a[href="./"]').forEach((a) => {
    a.setAttribute("href", a.getAttribute("href") + "?lang=" + LANG);
  });
}

// Translate the static page text as soon as the page has been read.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", translatePage);
else translatePage();
