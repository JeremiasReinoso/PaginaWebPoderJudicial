/** Offline writing practice. Deterministic rules, no API, model, telemetry or network. */
export const WRITING_QUESTIONS = Object.freeze([
  {
    id: 'writing-1',
    question:
      'Explicá con tus palabras por qué es importante comprender una consigna antes de responderla. Incluí un ejemplo. Escribí entre 40 y 150 palabras.',
    guide:
      'Leer con atención permite identificar qué se solicita y responder todas las partes. Por ejemplo, ante una consigna que pide comparar dos situaciones, conviene describir ambas, señalar semejanzas y diferencias y revisar la respuesta antes de entregarla. Este ejemplo orienta: tu texto puede estar organizado de otra manera.',
  },
  {
    id: 'writing-2',
    question:
      'Una persona llega a una oficina y no comprende qué documentación debe presentar. Escribí una respuesta clara, respetuosa y completa para orientarla sin inventar requisitos. Escribí entre 40 y 150 palabras.',
    guide:
      'Buen día. Para orientarte correctamente, primero necesitamos identificar el trámite que querés realizar. Podemos revisar juntos los requisitos en el canal oficial o consultar al sector correspondiente. Después te explicaré los pasos y dónde verificar la documentación. Antes de finalizar, podemos repasar cualquier duda. No se deben inventar requisitos ni prometer resultados.',
  },
]);

const COMMON = Object.freeze({
  divicion: 'división',
  divición: 'división',
  divisiónes: 'divisiones',
  comprencion: 'comprensión',
  comprención: 'comprensión',
  comprension: 'comprensión',
  organisacion: 'organización',
  organisación: 'organización',
  organizacion: 'organización',
  ortografia: 'ortografía',
  atencion: 'atención',
  documentacion: 'documentación',
  informacion: 'información',
  explicacion: 'explicación',
  constitucion: 'constitución',
  jurisdiccion: 'jurisdicción',
  obligacion: 'obligación',
  resolucion: 'resolución',
  evaluacion: 'evaluación',
  funcion: 'función',
  funciones: null,
  nesesario: 'necesario',
  nesesaria: 'necesaria',
  nesesita: 'necesita',
  nesecita: 'necesita',
  nesecesario: 'necesario',
  exepcion: 'excepción',
  exepción: 'excepción',
  excepcion: 'excepción',
  desicion: 'decisión',
  desición: 'decisión',
  decision: 'decisión',
  decicion: 'decisión',
  decición: 'decisión',
  tramites: 'trámites',
  tramite: null,
  juridico: 'jurídico',
  juridica: 'jurídica',
  juridicos: 'jurídicos',
  juridicas: 'jurídicas',
  parrafo: 'párrafo',
  parrafos: 'párrafos',
  tambien: 'también',
  atraves: 'a través',
  haci: 'así',
  hací: 'así',
  ciudadánia: 'ciudadanía',
  cuidadania: 'ciudadanía',
  ciudadania: 'ciudadanía',
});

export const CHECKLIST = Object.freeze([
  'Respondí todas las partes de la consigna e incluí el ejemplo cuando se pide.',
  'Usé oraciones completas y conecté las ideas con claridad.',
  'Revisé tildes, mayúsculas, concordancia y puntuación.',
  'Usé un trato respetuoso y evité inventar información.',
]);

export function validateWriting(answers) {
  if (
    !answers ||
    typeof answers !== 'object' ||
    Array.isArray(answers) ||
    Object.keys(answers).length !== WRITING_QUESTIONS.length
  ) {
    throw new Error('Completá las dos respuestas escritas.');
  }
  return WRITING_QUESTIONS.map(({ id, question }) => {
    const text = answers[id];
    const count =
      typeof text === 'string' ? text.trim().split(/\s+/).length : 0;
    if (
      typeof text !== 'string' ||
      text.length > 3000 ||
      count < 40 ||
      count > 150
    ) {
      throw new Error(
        'Cada respuesta escrita debe tener entre 40 y 150 palabras y hasta 3000 caracteres.',
      );
    }
    return { id, question, text: text.trim() };
  });
}

export function checkWriting(text) {
  const source = String(text).normalize('NFC');
  const words = [...source.matchAll(/\p{L}+/gu)];
  const observations = [];
  for (const word of words) {
    const replacement = COMMON[word[0].toLocaleLowerCase('es-AR')];
    if (replacement) {
      observations.push({
        original: word[0],
        suggestion: replacement,
        offset: word.index,
        message:
          'Posible error de escritura frecuente. Revisá la sugerencia en su contexto.',
      });
    }
  }
  for (let i = 1; i < words.length; i += 1) {
    if (
      words[i][0].toLocaleLowerCase('es-AR') ===
        words[i - 1][0].toLocaleLowerCase('es-AR') &&
      /^\s+$/.test(
        source.slice(
          words[i - 1].index + words[i - 1][0].length,
          words[i].index,
        ),
      )
    ) {
      observations.push({
        original: words[i][0],
        suggestion: 'Revisar repetición',
        offset: words[i].index,
        message:
          'Hay dos palabras iguales consecutivas; la repetición puede ser intencional.',
      });
    }
  }
  const first = words[0]?.[0];
  if (first && first[0] !== first[0].toLocaleUpperCase('es-AR')) {
    observations.push({
      original: first,
      suggestion: 'Revisar mayúscula inicial',
      offset: words[0].index,
      message: 'Comprobá si corresponde comenzar con mayúscula.',
    });
  }
  if (source.trim() && !/[.!?…][»”"')\]]*$/.test(source.trim())) {
    observations.push({
      original: '',
      suggestion: 'Revisar el cierre',
      offset: source.length,
      message: 'Comprobá si falta un signo de puntuación al final.',
    });
  }
  return {
    words: source.trim() ? source.trim().split(/\s+/).length : 0,
    observations,
    note: 'Revisión local limitada de errores frecuentes. No detecta todos los errores ni evalúa el contenido, la coherencia o la corrección jurídica.',
  };
}

export function buildWritingResult(answers) {
  return {
    local: true,
    answers: validateWriting(answers).map((a) => ({
      ...a,
      feedback: checkWriting(a.text),
      guide: WRITING_QUESTIONS.find((q) => q.id === a.id).guide,
    })),
  };
}
