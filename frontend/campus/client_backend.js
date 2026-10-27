/** Browser-side campus engine for static hosting (GitHub Pages) with identical rules to backend. */
import { LIBRARY_DATA } from './library_data.js';

const IDLE = 30 * 60;
const LIFETIME = 2 * 60 * 60;
const STORAGE_KEY = 'mj_campus_runtime_v1';

const MODULES = [
  'Organización del Estado',
  'El Poder Judicial de Mendoza',
  'Derechos Humanos',
  'Violencia de Género',
  'Atención para un Servicio de Justicia',
];

const ROWS = [
  [
    1,
    '¿Qué conjunto reúne elementos del Estado?',
    [
      'Territorio, población, poder y gobierno',
      'Edificios, vehículos y oficinas',
      'Solo territorio y gobierno',
      'Solo población y normas',
    ],
    0,
    'El material introductorio identifica territorio, población, poder y gobierno.',
  ],
  [
    1,
    '¿Qué representa el territorio de un Estado?',
    [
      'Su lista de autoridades',
      'El espacio geográfico donde ejerce soberanía',
      'Una reunión de ciudadanos',
      'Un procedimiento judicial',
    ],
    1,
    'El territorio es el espacio geográfico en el que el Estado ejerce su soberanía.',
  ],
  [
    1,
    '¿Qué distingue a un Estado de Derecho?',
    [
      'La ausencia de normas',
      'La concentración sin límites de toda autoridad',
      'Un ordenamiento que regula al gobierno y reconoce derechos',
      'La eliminación de los derechos individuales',
    ],
    2,
    'El Estado de Derecho somete la organización y el funcionamiento del gobierno a un ordenamiento jurídico.',
  ],
  [
    1,
    '¿Cuál es la función de una Constitución?',
    [
      'Reemplazar toda norma de procedimiento',
      'Organizar únicamente una oficina',
      'Regular solo contratos privados',
      'Establecer las bases fundamentales de la organización del Estado',
    ],
    3,
    'La Constitución es la norma fundamental de la organización estatal.',
  ],
  [
    2,
    '¿Para qué sirve especializar juzgados y tribunales por materia?',
    [
      'Para organizar el tratamiento de distintos tipos de conflictos',
      'Para eliminar los procedimientos',
      'Para evitar toda decisión judicial',
      'Para reemplazar al Poder Legislativo',
    ],
    0,
    'Los fueros agrupan la actividad jurisdiccional por materia.',
  ],
  [
    2,
    'En la explicación introductoria del proceso judicial, ¿qué caracteriza al tercero que decide el conflicto?',
    [
      'Representa necesariamente a ambas partes',
      'Debe actuar con imparcialidad',
      'Decide por sorteo sin reglas',
      'Carece de función en el conflicto',
    ],
    1,
    'El proceso se presenta como una vía de resolución ante un tercero imparcial.',
  ],
  [
    2,
    '¿Qué poder sanciona los códigos procesales según la introducción del módulo?',
    [
      'Poder Ejecutivo',
      'Cada parte del proceso',
      'Poder Legislativo',
      'Un proveedor privado',
    ],
    2,
    'La introducción señala que los códigos procesales son sancionados por el Poder Legislativo.',
  ],
  [
    2,
    '¿Cuál de estas expresiones nombra un fuero incluido en el módulo?',
    [
      'Fuero de publicidad',
      'Fuero de ventas',
      'Fuero de transporte turístico',
      'Fuero Civil, Comercial y Tributario',
    ],
    3,
    'El material desarrolla, entre otros, el fuero Civil, Comercial y Tributario.',
  ],
  [
    3,
    '¿Qué idea funda la noción de derechos humanos presentada en el material?',
    [
      'La dignidad de las personas',
      'La preferencia por un grupo social',
      'La supresión de garantías',
      'La utilidad económica exclusiva',
    ],
    0,
    'La dignidad de las personas es un principio fundante de los derechos humanos.',
  ],
  [
    3,
    'En la relación Estado-persona, ¿qué papel se destaca para el Estado?',
    [
      'Vendedor de los derechos',
      'Principal garante de los derechos',
      'Titular exclusivo de todos los derechos personales',
      'Observador sin obligaciones',
    ],
    1,
    'El material presenta al Estado como principal garante y a la persona como titular de derechos.',
  ],
  [
    3,
    '¿Cómo se describen los derechos humanos en la introducción?',
    [
      'Solo como un listado sin historia',
      'Como una cuestión exclusivamente privada',
      'Como construcciones sociales con una historia de luchas y aportes',
      'Como derechos reservados a funcionarios',
    ],
    2,
    'Su comprensión incluye el proceso histórico y social, además de los instrumentos normativos.',
  ],
  [
    3,
    '¿Para qué sirve promover una cultura de derechos humanos en la justicia?',
    [
      'Para eliminar toda garantía',
      'Para reemplazar el trato digno por formalidades',
      'Para limitar el acceso a un grupo',
      'Para orientar la actividad judicial hacia el respeto de los derechos',
    ],
    3,
    'El conocimiento de principios y estándares busca favorecer su aplicación cotidiana.',
  ],
  [
    4,
    '¿Qué permite analizar la perspectiva de género?',
    [
      'Desigualdades y relaciones de poder asociadas al género',
      'Solo diferencias en horarios de trabajo',
      'Exclusivamente expedientes contables',
      'Únicamente datos geográficos',
    ],
    0,
    'Es una herramienta de análisis de las relaciones y desigualdades vinculadas con el género.',
  ],
  [
    4,
    '¿Qué significa transversalizar la perspectiva de género?',
    [
      'Aplicarla únicamente en una charla',
      'Integrarla en políticas, decisiones y prácticas institucionales',
      'Excluirla de las decisiones',
      'Reducirla a una actividad optativa sin relación con el trabajo',
    ],
    1,
    'La transversalización supone integrar esta perspectiva en distintas prácticas y decisiones.',
  ],
  [
    4,
    '¿Qué reconoce un enfoque interseccional?',
    [
      'Que todas las experiencias son idénticas',
      'Que el género nunca se relaciona con otras desigualdades',
      'Que pueden entrelazarse distintos ejes de desigualdad y vulnerabilidad',
      'Que solo importa un aspecto de la persona',
    ],
    2,
    'La interseccionalidad considera cómo se relacionan distintos factores de desigualdad.',
  ],
  [
    4,
    '¿Qué actitud es compatible con una práctica institucional con perspectiva de género?',
    [
      'Reproducir estereotipos sin revisarlos',
      'Ignorar asimetrías de poder',
      'Tratar toda desigualdad como un problema inexistente',
      'Revisar estereotipos y considerar desigualdades relevantes',
    ],
    3,
    'La perspectiva de género requiere una mirada crítica sobre estereotipos y desigualdades.',
  ],
  [
    5,
    '¿Qué ubica en el centro un servicio judicial orientado a la ciudadanía?',
    [
      'Las necesidades, expectativas y derechos de las personas',
      'Solo la comodidad interna',
      'Únicamente los formularios',
      'La rapidez aunque se niegue información',
    ],
    0,
    'El enfoque centra las operaciones y decisiones en las personas y sus derechos.',
  ],
  [
    5,
    '¿Qué práctica ayuda a que una persona comprenda una comunicación judicial?',
    [
      'Agregar tecnicismos innecesarios',
      'Explicar con claridad y lenguaje comprensible',
      'Evitar todas las preguntas',
      'Dar instrucciones contradictorias',
    ],
    1,
    'La claridad de las comunicaciones contribuye al acceso efectivo a la justicia.',
  ],
  [
    5,
    '¿Dónde comienza a construirse un trato digno en el servicio de justicia?',
    [
      'Solo al terminar un expediente',
      'Solo en el archivo',
      'Desde la atención y las interacciones cotidianas',
      'Únicamente fuera de la institución',
    ],
    2,
    'El material destaca las interacciones de atención y las comunicaciones, además de las decisiones.',
  ],
  [
    5,
    '¿Cuál de estas situaciones constituye una barrera para acceder a la justicia?',
    [
      'Recibir una explicación clara',
      'Poder formular una consulta',
      'Ser orientado sobre un trámite',
      'No comprender la información necesaria para realizar un trámite',
    ],
    3,
    'El lenguaje incomprensible puede dificultar el acceso de la ciudadanía a sus derechos.',
  ],
];

const TEXTS = [
  {
    id: 'organizacion',
    title: 'Organizar el trabajo sin perder de vista a las personas',
    topic: 'Organización institucional',
    text: `Al comenzar una semana de trabajo, un equipo de atención revisó las consultas que habían quedado sin respuesta. La primera propuesta consistió en repartirlas por orden de llegada y pedir que cada agente resolviera la mayor cantidad posible. Sin embargo, antes de aplicar esa medida, el grupo examinó una muestra de los registros. Descubrió que algunas consultas estaban duplicadas, otras habían sido dirigidas a una oficina que no intervenía en el asunto y varias carecían de información suficiente para determinar el siguiente paso.

El hallazgo cambió la manera de organizar la tarea. En lugar de medir únicamente cuántas respuestas salían por día, el equipo decidió distinguir entre recibir una consulta, identificar su objeto y orientar a la persona. Esas acciones estaban relacionadas, pero no eran equivalentes. Registrar rápidamente un pedido podía mejorar una cifra sin acercar a quien consultaba a una solución. Del mismo modo, responder con una fórmula general podía cerrar un registro y, al mismo tiempo, provocar una nueva consulta por falta de claridad.

Para ordenar el trabajo, se elaboró una guía interna con tres preguntas: qué necesita la persona, qué información falta y qué sector tiene atribuciones para continuar. La guía no habilitaba a cualquier agente a decidir sobre cualquier asunto. Su finalidad era reconocer los límites de cada función y facilitar una derivación fundada. Cuando existían dudas sobre la competencia de un sector, correspondía verificarla antes de ofrecer una respuesta definitiva. También se acordó dejar constancia de la orientación brindada, evitando incorporar datos personales que no fueran necesarios.

La evaluación de la experiencia se realizó al finalizar el mes. El número de respuestas no había aumentado de manera espectacular, pero se habían reducido las derivaciones equivocadas y las consultas repetidas por instrucciones incompletas. Además, los registros permitían identificar con mayor precisión dónde se producían las demoras. Esa información era más útil para mejorar el servicio que una cifra aislada de trámites cerrados.

El equipo concluyó que organizar no consiste solamente en distribuir tareas. También exige comprender la finalidad de cada actividad, reconocer responsabilidades y revisar sus efectos. La rapidez conserva su importancia, pero necesita acompañarse de información correcta y de un recorrido comprensible para la persona. La experiencia mostró que una mejora modesta en los indicadores de volumen puede convivir con un avance significativo en la calidad de la atención. Ninguna cifra, considerada por separado, permite describir todo el funcionamiento de un servicio.`,
    questions: [
      [
        '¿Cuál fue el problema de la propuesta inicial?',
        [
          'Priorizaba el volumen sin examinar la naturaleza de las consultas',
          'Exigía revisar demasiados indicadores de calidad',
          'Impedía registrar pedidos',
          'Prohibía las derivaciones',
        ],
        0,
        'La revisión encontró duplicados y errores que un simple reparto por cantidad no resolvía.',
      ],
      [
        '¿Qué función cumplía la guía interna?',
        [
          'Otorgar nuevas atribuciones judiciales',
          'Identificar necesidades, información faltante y sector competente',
          'Sustituir todas las normas de organización',
          'Eliminar los registros de atención',
        ],
        1,
        'Las tres preguntas orientaban el trabajo sin ampliar las competencias de los agentes.',
      ],
      [
        '¿Qué se puede inferir del resultado del mes?',
        [
          'Toda reducción de volumen indica un fracaso',
          'La rapidez dejó de tener importancia',
          'La calidad puede mejorar sin un gran aumento de respuestas',
          'Las estadísticas ya no aportan información',
        ],
        2,
        'Bajaron errores y repeticiones aunque el volumen no creció de forma espectacular.',
      ],
      [
        '¿Cuál es la idea central del texto?',
        [
          'Cerrar registros es el único objetivo',
          'Todas las oficinas tienen iguales funciones',
          'La atención depende solo de la buena voluntad',
          'La organización debe relacionar tareas, responsabilidades y efectos sobre las personas',
        ],
        3,
        'La conclusión integra finalidad, responsabilidades, claridad y evaluación del servicio.',
      ],
    ],
  },
  {
    id: 'comunicacion',
    title: 'Una explicación que permite continuar',
    topic: 'Atención y lenguaje claro',
    text: `Una persona llegó a una oficina después de recibir un mensaje que le pedía completar documentación. Había leído la comunicación varias veces, pero no sabía si debía presentar originales, enviar copias o solicitar una entrevista. En la recepción explicó que temía perder tiempo y volver a su casa sin haber realizado el trámite. La agente que la atendió advirtió que repetir las mismas palabras del mensaje no resolvería la dificultad: el problema no era la falta de lectura, sino la ausencia de instrucciones comprensibles.

La agente comenzó por preguntar qué parte de la comunicación generaba dudas. Escuchó la respuesta completa y reformuló lo que había entendido. Así pudo distinguir dos necesidades: conocer qué documentos faltaban y saber por qué canal debían presentarse. Antes de responder, verificó la información disponible y consultó al sector responsable sobre un requisito que no estaba claro. Esa consulta evitó ofrecer una indicación segura en apariencia, pero posiblemente incorrecta. Reconocer un límite de conocimiento no significaba abandonar la atención, sino buscar una respuesta confiable.

Una vez confirmados los datos, organizó la explicación en pasos breves. Indicó primero la documentación necesaria; después, el medio de presentación; finalmente, la forma de consultar el estado del pedido. Explicó los términos técnicos que no podían omitirse y entregó una guía escrita con la misma secuencia. No prometió que el trámite tendría un resultado favorable ni que se resolvería antes de una fecha determinada, porque ninguna de esas decisiones dependía de ella.

Antes de finalizar, pidió a la persona que contara con sus propias palabras qué haría al salir de la oficina. La respuesta permitió advertir una confusión que todavía persistía sobre el canal de presentación. La agente volvió sobre ese punto y lo aclaró con un ejemplo. Si se hubiera limitado a preguntar si todo estaba entendido, probablemente habría recibido una respuesta afirmativa y la dificultad habría permanecido oculta.

Al revisar la experiencia, el equipo distinguió entre brindar mucha información y brindar información útil. La claridad no exigía suprimir todos los detalles, sino seleccionar los pertinentes, ordenarlos y comprobar su comprensión. La escucha había permitido identificar el problema real; la verificación había sostenido la precisión; la explicación por pasos había facilitado la acción. El valor de la atención no residió en hablar más, sino en que la persona pudiera continuar con un próximo paso concreto, sin falsas garantías y con un canal de consulta disponible.`,
    questions: [
      [
        '¿Cuál era la dificultad principal de la persona?',
        [
          'Se negaba a leer el mensaje',
          'No comprendía cómo cumplir las instrucciones',
          'No quería presentar documentación',
          'Ya había completado todos los requisitos',
        ],
        1,
        'El texto distingue expresamente la falta de comprensión de la falta de lectura.',
      ],
      [
        '¿Por qué la agente consultó al sector responsable?',
        [
          'Para evitar escuchar a la persona',
          'Para garantizar un resultado favorable',
          'Para verificar un requisito antes de informar',
          'Para cancelar la atención',
        ],
        2,
        'Buscó precisión frente a una duda en lugar de improvisar una respuesta.',
      ],
      [
        '¿Qué permitió detectar la confusión restante?',
        [
          'Entregar más formularios',
          'Repetir una fórmula técnica',
          'Prometer una fecha de resolución',
          'Pedir que la persona explicara los pasos con sus palabras',
        ],
        3,
        'La reformulación de la persona reveló la duda sobre el canal de presentación.',
      ],
      [
        '¿Qué conclusión sostiene el texto?',
        [
          'La información útil combina precisión, orden y comprobación de comprensión',
          'La claridad requiere eliminar todos los detalles',
          'Una respuesta extensa siempre es mejor',
          'La atención debe asegurar decisiones favorables',
        ],
        0,
        'La conclusión relaciona escucha, verificación, explicación y posibilidad de actuar.',
      ],
    ],
  },
  {
    id: 'accesibilidad',
    title: 'Dos maneras de mejorar el mismo recorrido',
    topic: 'Derechos y accesibilidad',
    text: `En un espacio de formación se propuso analizar el recorrido de una persona que intentaba realizar una consulta institucional. La entrada del edificio contaba con una rampa, pero la información sobre turnos solo estaba disponible en un cartel con letra pequeña. A su vez, el formulario digital utilizaba instrucciones extensas y, cuando faltaba un dato, mostraba un mensaje de error que no explicaba cómo corregirlo. El ejemplo permitió advertir que una mejora física, aunque necesaria, no bastaba para volver accesible todo el servicio.

El grupo organizó los obstáculos en varias dimensiones. Algunos correspondían al entorno material; otros, a la comunicación o a las herramientas tecnológicas. También identificó barreras actitudinales: suponer que una persona no comprendería por su edad, hablar únicamente con quien la acompañaba o imponer ayuda sin preguntarle. Estas conductas podían dificultar la participación incluso cuando el edificio y el sistema digital funcionaban correctamente. La accesibilidad debía examinarse como una relación entre las personas y las condiciones concretas del entorno.

A partir de ese diagnóstico se discutieron dos líneas de trabajo. La primera consistía en revisar el diseño habitual del servicio: mejorar la señalización, redactar instrucciones claras, ofrecer formatos legibles y probar los formularios con distintas necesidades de uso. La segunda atendía situaciones particulares que requerían una adaptación específica. Por ejemplo, podía resultar necesario ofrecer otro canal de comunicación o disponer de un apoyo para una persona determinada. La existencia de un diseño general más accesible no eliminaba todas las necesidades individuales.

Durante el debate surgió una propuesta de crear un circuito separado para cualquier persona que pareciera necesitar ayuda. El grupo la cuestionó porque se basaba en apariencias y podía limitar innecesariamente la autonomía. En cambio, propuso consultar qué apoyo se requería, dirigirse a la persona interesada y permitir que participara en las decisiones sobre su propio recorrido. La respuesta debía ajustarse a una necesidad reconocida, no a una presunción sobre sus capacidades.

La conclusión fue que el acceso efectivo necesita combinar previsión y flexibilidad. Prever significa reducir obstáculos desde la organización ordinaria del servicio. Ser flexible implica reconocer que pueden aparecer situaciones que ese diseño no haya resuelto. Ambas estrategias se complementan y requieren evaluación: no alcanza con declarar que un canal es accesible si quienes lo utilizan no pueden completar la tarea. Escuchar la experiencia de las personas permite descubrir barreras que una revisión exclusivamente interna puede dejar inadvertidas.`,
    questions: [
      [
        '¿Qué muestra el ejemplo de la rampa y el formulario?',
        [
          'La accesibilidad depende únicamente del edificio',
          'Las herramientas digitales siempre eliminan las barreras',
          'La accesibilidad comprende varias dimensiones del servicio',
          'La comunicación escrita no influye en el acceso',
        ],
        2,
        'El ejemplo reúne obstáculos físicos, comunicacionales, tecnológicos y actitudinales.',
      ],
      [
        '¿Por qué se cuestionó el circuito separado propuesto?',
        [
          'Porque permitía preguntar qué apoyo era necesario',
          'Porque eliminaba todos los formularios',
          'Porque exigía mejorar la señalización',
          'Porque se basaba en apariencias y podía restringir autonomía',
        ],
        3,
        'El grupo prefirió consultar necesidades en vez de presumir capacidades por la apariencia.',
      ],
      [
        '¿Cómo se relacionan previsión y flexibilidad?',
        [
          'Se complementan: diseño habitual y respuesta a necesidades particulares',
          'Una vuelve innecesaria a la otra',
          'Solo se aplican a edificios nuevos',
          'Son dos nombres para una misma medida',
        ],
        0,
        'El texto diferencia las dos estrategias y explica que deben actuar juntas.',
      ],
      [
        '¿Para qué sirve escuchar a quienes utilizan el servicio?',
        [
          'Para sustituir toda evaluación técnica',
          'Para reconocer barreras que la revisión interna puede omitir',
          'Para prometer que nunca existirán obstáculos',
          'Para asignar capacidades según la edad',
        ],
        1,
        'La experiencia de uso aporta dificultades que pueden no ser visibles desde la institución.',
      ],
    ],
  },
  {
    id: 'perspectiva',
    title: 'Revisar las primeras impresiones',
    topic: 'Perspectiva de género y trato respetuoso',
    text: `En una actividad de capacitación, un grupo recibió la descripción de una entrevista ficticia. Una persona había realizado una consulta y luego había cambiado parte de su relato. Algunos participantes interpretaron ese cambio como prueba suficiente de que la consulta no era seria. Otros propusieron detenerse antes de llegar a una conclusión y revisar qué información faltaba. La coordinadora aclaró que el ejercicio no buscaba decidir un caso, sino examinar cómo las primeras impresiones pueden influir en la atención y en la lectura de un registro.

El grupo volvió entonces sobre la descripción. No sabía en qué condiciones se había desarrollado la primera conversación, si la persona había comprendido las preguntas o si existían temores que dificultaran hablar. Tampoco contaba con otros elementos que permitieran explicar el cambio. Reconocer esas ausencias no obligaba a aceptar una única hipótesis; exigía evitar que una interpretación inicial se presentara como un hecho demostrado. La diferencia entre describir una conducta y atribuirle un significado definitivo se volvió central para el análisis.

Después se trabajó sobre los estereotipos. Una expectativa acerca de cómo debería hablar, vestirse o reaccionar alguien podía convertirse en un criterio implícito para evaluar su credibilidad. El problema no era observar lo que ocurría en la entrevista, sino utilizar un modelo rígido de comportamiento para descartar experiencias diferentes. El equipo también consideró que las dificultades económicas, el idioma, la edad y las relaciones de dependencia podían combinarse e influir en la posibilidad de pedir ayuda. Ningún factor aislado describía por completo la situación de una persona.

Como parte de la revisión, se propusieron prácticas de atención: explicar el propósito de las preguntas, evitar repeticiones innecesarias del relato, cuidar la privacidad y registrar de manera precisa qué se había dicho. También se destacó la importancia de conocer los canales institucionales disponibles y de actuar dentro de las propias atribuciones. Escuchar respetuosamente no significaba anticipar una decisión, reemplazar una investigación o asegurar un resultado. Significaba crear condiciones adecuadas para que la consulta pudiera ser comprendida y encaminada.

Al finalizar, los participantes reformularon su primera respuesta. En lugar de afirmar que el cambio de relato demostraba por sí mismo una intención, señalaron que necesitaban contexto y elementos adicionales. El aprendizaje no consistió en reemplazar un prejuicio por una certeza opuesta, sino en reconocer la incertidumbre y mejorar el método de análisis. Revisar estereotipos permite formular mejores preguntas, distinguir datos de inferencias y reducir daños que pueden surgir de una respuesta institucional apresurada.`,
    questions: [
      [
        '¿Cuál era el objetivo de la capacitación?',
        [
          'Examinar la influencia de las primeras impresiones en la atención',
          'Resolver definitivamente un caso real',
          'Establecer una única reacción válida',
          'Sustituir los canales institucionales',
        ],
        0,
        'La coordinadora diferencia el análisis de prácticas de la decisión de un caso.',
      ],
      [
        '¿Qué diferencia destaca el segundo párrafo?',
        [
          'Entre entrevistar y registrar, actividades incompatibles',
          'Entre describir una conducta y atribuirle un significado definitivo',
          'Entre privacidad y atención, objetivos opuestos',
          'Entre un dato completo y una sentencia',
        ],
        1,
        'El cambio observado no demostraba por sí solo la explicación que se le atribuía.',
      ],
      [
        '¿Qué función cumple considerar factores combinados?',
        [
          'Reducir todas las experiencias a una causa',
          'Establecer credibilidad por apariencia',
          'Comprender que varias condiciones pueden influir en pedir ayuda',
          'Evitar formular preguntas',
        ],
        2,
        'El texto relaciona distintas condiciones sin convertir una en explicación total.',
      ],
      [
        '¿Qué cambió al final de la actividad?',
        [
          'Se adoptó la certeza opuesta sin examinarla',
          'Se decidió ignorar todo registro',
          'Se garantizó un resultado favorable',
          'Se reconoció la necesidad de contexto y elementos adicionales',
        ],
        3,
        'La conclusión sustituye el juicio apresurado por un análisis que reconoce incertidumbre.',
      ],
    ],
  },
  {
    id: 'estudio',
    title: 'Leer, comparar y comprobar lo aprendido',
    topic: 'Método de estudio e integración',
    text: `Una estudiante preparaba cinco módulos para una evaluación. Durante los primeros días subrayaba casi todos los párrafos y repetía las definiciones hasta poder reconocerlas al verlas escritas. Esa familiaridad le daba confianza, pero al resolver ejercicios encontraba dificultades para distinguir conceptos próximos. Podía recordar una frase y, aun así, no explicar por qué una opción era más adecuada que otra. Decidió entonces revisar su forma de estudiar, sin abandonar la lectura de los documentos completos.

En la siguiente etapa comenzó cada tema con una lectura orientada a comprender su estructura. Identificaba la pregunta principal, los conceptos necesarios para responderla y las relaciones entre ellos. Después elaboraba un resumen con sus propias palabras. Si no podía explicar una idea sin copiar el párrafo, volvía a la fuente y buscaba qué parte no había entendido. El resumen no se utilizaba como sustituto automático del material, sino como una herramienta para comprobar comprensión y organizar el repaso posterior.

Para los conceptos que confundía, preparó cuadros comparativos. En cada fila anotaba las nociones que necesitaba diferenciar y elegía criterios comunes: función, alcance, participantes o finalidad. Esa decisión era importante, porque una comparación pierde utilidad cuando cada columna responde a una pregunta distinta. También dibujaba mapas conceptuales para mostrar relaciones más amplias entre los temas. El cuadro ayudaba a distinguir; el mapa, a conectar. Ambos recursos eran complementarios y podían corregirse a medida que avanzaba la lectura.

Al terminar una unidad, respondía preguntas sin consultar sus apuntes. Luego revisaba no solo los errores, sino también las respuestas correctas que había elegido por descarte o con dudas. Anotaba el motivo de la dificultad: confusión de términos, lectura apresurada, olvido de una excepción o falta de comprensión. De ese modo, la puntuación se convertía en información para planificar la próxima sesión. Repetir de inmediato el mismo ejercicio podía mejorar el resultado por memoria de las opciones, sin demostrar necesariamente una comprensión más sólida.

Con el tiempo incorporó repasos que relacionaban los cinco módulos. Un caso de atención podía exigir reconocer una función institucional, identificar una barrera y explicar un próximo paso de manera clara. Estas conexiones le permitían evitar que cada unidad quedara aislada. Su objetivo no era memorizar un recorrido único para cualquier situación, sino disponer de criterios para analizar preguntas diferentes. La experiencia le mostró que estudiar implica alternar lectura, elaboración y recuperación activa, y utilizar los resultados para decidir qué necesita volver a trabajar.`,
    questions: [
      [
        '¿Qué limitación tenía la estrategia inicial?',
        [
          'Impedía reconocer palabras escritas',
          'Generaba familiaridad sin asegurar diferenciación de conceptos',
          'Prohibía leer documentos completos',
          'Evitaba cualquier ejercicio',
        ],
        1,
        'Reconocer una definición no le permitía siempre justificar una elección.',
      ],
      [
        '¿Por qué conviene usar criterios comunes en un cuadro?',
        [
          'Para que todas las ideas sean iguales',
          'Para reemplazar el material original',
          'Para comparar las nociones sobre una misma base',
          'Para eliminar las diferencias',
        ],
        2,
        'Si las columnas responden a preguntas distintas, la comparación pierde utilidad.',
      ],
      [
        '¿Por qué revisaba algunas respuestas correctas?',
        [
          'Porque toda respuesta correcta es inválida',
          'Para modificar la puntuación',
          'Para evitar próximos repasos',
          'Porque podían haberse elegido con dudas o por descarte',
        ],
        3,
        'El texto diferencia acertar de comprender con seguridad.',
      ],
      [
        '¿Cuál es el papel de la puntuación en el método?',
        [
          'Aportar información para decidir qué volver a trabajar',
          'Reemplazar toda lectura',
          'Demostrar por sí sola comprensión definitiva',
          'Indicar que nunca debe repetirse un tema',
        ],
        0,
        'La estudiante analiza resultados y motivos de dificultad para planificar el estudio.',
      ],
    ],
  },
];

const QUESTIONS = Object.fromEntries(
  ROWS.map(([module, question, options, correct, explanation], i) => {
    const id = `m${module}-${i}`;
    return [id, { id, module, question, options, correct, explanation }];
  }),
);

for (const item of TEXTS) {
  item.questionIds = [];
  item.questions.forEach(([question, options, correct, explanation], index) => {
    const key = `read-${item.id}-${index}`;
    item.questionIds.push(key);
    QUESTIONS[key] = {
      id: key,
      module: 0,
      question,
      options,
      correct,
      explanation,
    };
  });
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  if (crypto?.subtle) {
    const data = new TextEncoder().encode(String(text));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  }
  return String(text);
}

function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  return /^MJ[0-9A-F]{32}$/.test(normalized) ? normalized : null;
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore storage errors
  }
  return {
    session: null,
    failures: [],
    attempts: {},
    history: {},
    rotation: {},
  };
}

function saveState(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function getActiveSession(state) {
  const now = Date.now() / 1000;
  const s = state.session;
  if (!s) return null;
  if (now - s.created > LIFETIME || now - s.touched > IDLE) {
    state.session = null;
    saveState(state);
    return null;
  }
  s.touched = now;
  saveState(state);
  return s;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const rand = new Uint32Array(1);
    crypto.getRandomValues(rand);
    const j = rand[0] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function drawText(state, username, mode) {
  const key = `${username}::${mode}`;
  const rot = state.rotation[key] || { remaining: [], last: null };
  const ids = TEXTS.map((item) => item.id);
  let remaining = (rot.remaining || []).filter((id) => ids.includes(id));
  if (!remaining.length) remaining = [...ids];
  let candidates = remaining.filter((id) => id !== rot.last);
  if (!candidates.length) candidates = remaining;
  const rand = new Uint32Array(1);
  crypto.getRandomValues(rand);
  const selected = candidates[rand[0] % candidates.length];
  remaining = remaining.filter((id) => id !== selected);
  state.rotation[key] = { remaining, last: selected };
  return TEXTS.find((item) => item.id === selected);
}

function catalog(data) {
  return {
    title: 'Biblioteca de estudio',
    note: data.note,
    edition: data.edition,
    sources: data.sources.map(({ id, title, pages, originalName }) => ({
      id,
      title,
      pages,
      originalName,
    })),
    modules: data.modules.map(({ id, title, intro, sourceIds, summary }) => ({
      id,
      title,
      intro,
      sourceIds,
      sections: summary.length,
    })),
  };
}

function resolveBookUrls() {
  const urls = {};
  for (let i = 1; i <= 5; i += 1) {
    urls[i] = new URL(
      `../assets/pdfs-estudio/module-${i}.pdf`,
      location.href,
    ).href;
  }
  return urls;
}

export async function clientLogin(code) {
  if (typeof code !== 'string' || code.length < 1 || code.length > 128) {
    throw new Error('Ingresá tu código de acceso.');
  }
  const state = loadState();
  const now = Date.now() / 1000;
  state.failures = (state.failures || []).filter((at) => at >= now - 900);
  if (state.failures.length >= 6) {
    saveState(state);
    throw new Error('Demasiados intentos. Esperá 15 minutos.');
  }
  const normalized = normalizeCode(code);
  const rejectedDemo = normalized === `MJ${'FF'.repeat(16)}`;
  if (!normalized || rejectedDemo) {
    state.failures.push(now);
    saveState(state);
    throw new Error('Código incorrecto, vencido o no habilitado.');
  }
  const fingerprint = await sha256Hex(normalized);
  const principal =
    fingerprint ===
    '954340c83b3299490a969abf4f8129c6112a0b3e5b61488ea475ed0dc0a1f1fe'
      ? 'amigo_864dd68a'
      : `estudiante_${fingerprint.slice(0, 8)}`;
  const csrf = randomHex(24);
  state.failures = [];
  state.session = {
    username: principal,
    csrf,
    created: now,
    touched: now,
  };
  saveState(state);
  return { authenticated: true, csrf };
}

export async function clientApi(path, body) {
  const state = loadState();
  if (path === '/api/session') {
    const s = getActiveSession(state);
    if (s && s.username) {
      return { authenticated: true, csrf: s.csrf };
    }
    const csrf = randomHex(24);
    return { authenticated: false, csrf };
  }
  if (path === '/api/login') {
    return clientLogin(body?.code);
  }
  const session = getActiveSession(state);
  if (!session || !session.username) {
    const err = new Error('Ingresá con un código habilitado para acceder.');
    err.status = 401;
    throw err;
  }
  const principal = session.username;

  if (path === '/api/logout') {
    state.session = null;
    saveState(state);
    return { ok: true };
  }

  if (path === '/api/dashboard') {
    const userHistory = state.history[principal] || [];
    const results = [...userHistory]
      .sort((a, b) => b.submitted - a.submitted)
      .slice(0, 20);
    const earnedSet = new Set(
      userHistory
        .filter(
          (r) =>
            r.mode.startsWith('module-') &&
            r.total > 0 &&
            r.score * 4 >= r.total * 3,
        )
        .map((r) => r.mode),
    );
    return {
      displayName: 'Acceso personal',
      modules: MODULES,
      results,
      achievements: [...earnedSet].sort(),
      notices: [
        'Campus local de prueba. Ejercicios originales, sin valor oficial.',
        'Prueba: 4 preguntas por módulo y 20 en el integrador. La versión completa de 20/50 sigue en preparación.',
        'Lectura y mecanografía: textos largos aleatorios, sin repetir hasta recorrer el banco.',
      ],
    };
  }

  if (path === '/api/typing') {
    return {
      text: 'Iniciá una práctica para recibir un texto aleatorio. El cronómetro comenzará en ese momento.',
      availableTexts: TEXTS.length,
    };
  }

  if (path === '/api/library') {
    return catalog(LIBRARY_DATA);
  }

  const modMatch = path.match(/^\/api\/library\/modules\/(1|2|3|4|5|general)$/);
  if (modMatch) {
    const item = LIBRARY_DATA.modules.find((m) => m.id === modMatch[1]);
    if (!item) throw new Error('Recurso de biblioteca no disponible.');
    return {
      module: item,
      note: LIBRARY_DATA.note,
      sources: catalog(LIBRARY_DATA).sources,
      bookUrls: resolveBookUrls(),
    };
  }

  if (path === '/api/exams/start' || path === '/api/typing/start') {
    const value = path === '/api/typing/start' ? 'typing' : body?.mode;
    const isModule = typeof value === 'string' && /^module-[1-5]$/.test(value);
    const isFinal = value === 'final';
    const isReading = value === 'reading';
    const isTyping = value === 'typing';
    if (!isModule && !isFinal && !isReading && !isTyping) {
      throw new Error('Ejercicio inválido.');
    }
    const attempt = randomHex(18);
    let content = null;
    let ids = [];
    if (isReading || isTyping) {
      const chosen = drawText(state, principal, value);
      content = {
        id: chosen.id,
        title: chosen.title,
        topic: chosen.topic,
        text: isTyping
          ? chosen.text.trim().split(/\s+/).join(' ')
          : chosen.text,
      };
      ids = isReading ? [...chosen.questionIds] : [];
    } else {
      const targetModule = isModule ? Number(value.slice(-1)) : null;
      ids = Object.entries(QUESTIONS)
        .filter(
          ([, q]) => q.module && (isFinal || q.module === targetModule),
        )
        .map(([key]) => key);
    }
    shuffle(ids);
    state.attempts[principal] = {
      id: attempt,
      username: principal,
      mode: value,
      questions: ids,
      started: Date.now() / 1000,
      submitted: null,
      content,
    };
    saveState(state);

    const metadata = content
      ? {
          textId: content.id,
          title: content.title,
          topic: content.topic,
          wordCount: content.text.trim().split(/\s+/).length,
        }
      : {};

    if (isTyping) {
      return { attempt, text: content.text, ...metadata };
    }
    const questions = ids.map((qid) => {
      const { correct, explanation, ...rest } = QUESTIONS[qid];
      return rest;
    });
    return {
      attempt,
      questions,
      mode: value,
      passage: isReading ? content.text : null,
      ...metadata,
    };
  }

  if (path === '/api/exams/submit' || path === '/api/typing/submit') {
    const typing = path === '/api/typing/submit';
    const attemptId = body?.attempt;
    const current = state.attempts[principal];
    if (!current || current.id !== attemptId) {
      throw new Error('Intento no encontrado.');
    }
    if (current.submitted !== null) {
      throw new Error('Este intento ya fue corregido.');
    }
    const now = Date.now() / 1000;
    if (now - current.started > 2 * 60 * 60) {
      throw new Error('El intento venció.');
    }

    let score = 0;
    let total = 0;
    let result;

    if (typing) {
      if (current.mode !== 'typing') throw new Error('Texto inválido.');
      const typed = body?.text;
      if (
        typeof typed !== 'string' ||
        typed.length < 1 ||
        typed.length > 5000
      ) {
        throw new Error('Texto inválido.');
      }
      const source = current.content.text;
      const seconds = Math.max(now - current.started, 1);
      const minLen = Math.min(typed.length, source.length);
      for (let i = 0; i < minLen; i += 1) {
        if (typed[i] === source[i]) score += 1;
      }
      total = Math.max(typed.length, source.length);
      const round1 = (n) => Math.round(n * 10) / 10;
      result = {
        seconds: round1(seconds),
        accuracy: round1((100 * score) / total),
        wpm: round1(score / 5 / (seconds / 60)),
        completed: typed === source,
        note: 'Precisión por coincidencia de caracteres en la misma posición; el texto faltante también cuenta.',
      };
    } else {
      if (current.mode === 'typing') {
        throw new Error('Respondé todas las preguntas.');
      }
      const answers = body?.answers;
      const qs = current.questions.map((qid) => QUESTIONS[qid]);
      if (
        typeof answers !== 'object' ||
        answers === null ||
        Array.isArray(answers) ||
        Object.keys(answers).length !== qs.length ||
        qs.some(
          (q) =>
            typeof answers[q.id] !== 'number' ||
            !Number.isInteger(answers[q.id]) ||
            answers[q.id] < 0 ||
            answers[q.id] > 3,
        )
      ) {
        throw new Error('Respondé todas las preguntas.');
      }
      for (const q of qs) {
        if (answers[q.id] === q.correct) score += 1;
      }
      total = qs.length;
      result = {
        score,
        total,
        percent: Math.round((score * 100) / total),
        passed: score / total >= 0.75,
        review: qs.map((q) => ({
          question: q.question,
          selected: q.options[answers[q.id]],
          correct: q.options[q.correct],
          explanation: q.explanation,
        })),
      };
    }

    current.submitted = now;
    if (!state.history[principal]) state.history[principal] = [];
    state.history[principal].push({
      mode: current.mode,
      score,
      total,
      submitted: now,
    });
    saveState(state);
    return result;
  }

  throw new Error('Recurso no disponible.');
}
