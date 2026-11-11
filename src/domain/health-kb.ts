/**
 * Base de dados de saúde — Tabela de palavras-chave para direcionamento.
 *
 * Cada entrada define:
 *   - keywords: termos que o usuário pode digitar (em português)
 *   - level: gravidade classificada (leve, moderado, urgente)
 *   - facility_type: tipo de unidade recomendada (ubs, upa, emergencia)
 *   - guidance: orientação segura e conservadora
 *   - warning_signs: sinais de alerta, se houver
 *   - source: referência pública
 *
 * O algoritmo usa essa base ANTES de chamar a IA para classificação,
 * garantindo respostas rápidas para padrões conhecidos e usando a IA
 * apenas para casos que não batem em nenhuma regra.
 */

export interface HealthKnowledgeEntry {
  id: string;
  keywords: string[];
  level: "leve" | "moderado" | "urgente";
  facility_type: "ubs" | "upa" | "emergencia";
  guidance: string;
  warning_signs: string[];
  source: string;
}

export const HEALTH_KNOWLEDGE_BASE: HealthKnowledgeEntry[] = [
  // ==================== EMERGÊNCIA ====================
  {
    id: "emer-01",
    keywords: ["dor no peito", "aperto no peito", "pressão no peito", "infarto", "ataque cardíaco", "dor no coração"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Dor no peito pode indicar uma emergência cardíaca. Recomendamos buscar imediatamente uma emergência hospitalar. Ligue 192 (SAMU) se a dor for intensa, persistente ou vier acompanhada de outros sintomas como suor frio, falta de ar ou dor no braço esquerdo.",
    warning_signs: ["Dor no peito", "Risco cardíaco"],
    source: "Protocolo de Manchester — Categoria Vermelha",
  },
  {
    id: "emer-02",
    keywords: ["falta de ar grave", "dificuldade para respirar", "sufocamento", "não consigo respirar", "dispneia aguda", "engasgo"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Falta de ar grave requer avaliação imediata em emergência. Procure um pronto-socorro ou ligue 192 (SAMU). Não dirija sozinho — peça alguém para levar ou chame o serviço de emergência.",
    warning_signs: ["Falta de ar grave", "Risco respiratório"],
    source: "Protocolo de Manchester — Categoria Vermelha",
  },
  {
    id: "emer-03",
    keywords: ["perda de consciência", "desmaio", "desmaiou", "faint", "caiu desmaiado", "inconsciência"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Perda de consciência é um sinal de alerta importante. Recomendamos emergência imediata. Ligue 192 (SAMU) se a pessoa ainda estiver inconsciente ou se o desmaio foi seguido de convulsão, confusão ou dor no peito.",
    warning_signs: ["Perda de consciência", "Risco neurológico"],
    source: "Protocolo de Manchester — Categoria Vermelha",
  },
  {
    id: "emer-04",
    keywords: ["sangramento intenso", "hemorragia", "sangrando muito", "sangue sem parar", "corte profundo", "ferimento grave"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Sangramento intenso que não para com pressão direta requer emergência. Vá ao pronto-socorro mais próximo ou ligue 192 (SAMU). Enquanto aguarda, mantenha pressão no local com pano limpo e eleve o membro afetado se possível.",
    warning_signs: ["Sangramento intenso", "Risco hemorrágico"],
    source: "Protocolo de Manchester — Categoria Vermelha",
  },
  {
    id: "emer-05",
    keywords: ["suspeita de avc", "derrame", "face assimétrica", "fala arrastada", "fraqueza lateral", "braço fraco", " boca torta"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Estes podem ser sinais de AVC (Acidente Vascular Cerebral). Tempo é crucial — ligue 192 (SAMU) imediatamente. Anote o horário do início dos sintomas. Não dê comida, água ou medicação até a avaliação médica.",
    warning_signs: ["Suspeita de AVC", "Risco neurológico"],
    source: "Manual de Diretrizes da Sociedade Brasileira de Cardiologia",
  },
  {
    id: "emer-06",
    keywords: ["reação alérgica grave", "anafilaxia", "inchaço na garganta", "lábios inchados", "não consegue engolir", "choque alérgico", "urticária extensa"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Reação alérgica grave pode evoluir rapidamente para anafilaxia. Procure emergência imediatamente ou ligue 192 (SAMU). Se a pessoa possui epinefrina autoinjetável e foi orientada a usar, aplique enquanto aguarda socorro.",
    warning_signs: ["Anafilaxia", "Risco respiratório"],
    source: "Diretrizes da Associação Brasileira de Alergia e Imunologia",
  },
  {
    id: "emer-07",
    keywords: ["pensamento suicida", "quero me machucar", "não quero viver", "automutilação", "crise nervosa grave", "tentativa de suicídio"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "É importante buscar ajuda profissional imediata. Ligue 188 (CVV — Centro de Valorização da Vida, 24h, gratuito) ou 192 (SAMU). Você não está sozinho, há pessoas prontas para ouvir e ajudar. Vá a uma emergência se precisar de atendimento presencial.",
    warning_signs: ["Risco à vida", "Crise de saúde mental"],
    source: "CVV — Centro de Valorização da Vida (188)",
  },
  {
    id: "emer-08",
    keywords: ["convulsão", "seizure", "ataque epilético", "tremor incontrolável", "espasmo"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Convulsão requer avaliação emergencial. Ligue 192 (SAMU) se for a primeira vez, durar mais de 5 minutos, ou se a pessoa não recuperar a consciência. Proteja a cabeça, afaste objetos perigosos e não coloque nada na boca da pessoa.",
    warning_signs: ["Convulsão", "Risco neurológico"],
    source: "Protocolo de Manchester — Categoria Vermelha",
  },
  {
    id: "emer-09",
    keywords: ["febre alta", "febre acima de 39", "temperatura muito alta", "febre com manchas", "febre com rigidez"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Febre alta (acima de 39°C) acompanhada de outros sintomas como manchas na pele, rigidez na nuca ou confusão mental requer emergência. Ligue 192 (SAMU) ou vá ao pronto-socorro. Febre isolada em adultos geralmente pode ser avaliada em UPA.",
    warning_signs: ["Febre alta", "Possível infecção grave"],
    source: "Ministério da Saúde — Protocolo de Manejo da Febre",
  },
  {
    id: "emer-10",
    keywords: ["fratura", "osso quebrado", "osso fora do lugar", "deformidade", "trauma grave", "queda de altura", "acidente grave"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Fraturas e traumas graves precisam de avaliação em emergência. Não tente mover ou realinhar o membro afetado. Imobilize da melhor forma possível e vá ao pronto-socorro ou ligue 192 (SAMU) para transporte seguro.",
    warning_signs: ["Trauma grave", "Fratura"],
    source: "Protocolo de Manchester — Categoria Laranja/Vermelha",
  },

  // ==================== MODERADO / UPA ====================
  {
    id: "mod-01",
    keywords: ["dor de cabeça forte", "enxaqueca", "dor de cabeça que não passa", "cefaleia intensa", "migrânea"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Dor de cabeça forte ou persistente pode ser avaliada em uma UPA. Se a dor for de início súbito e extrema (\"pior dor da vida\"), ou vier acompanhada de vômitos, visão embaçada ou fraqueza, considere emergência. Caso contrário, a UPA é uma boa opção.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-02",
    keywords: ["tontura", "vertigem", "tonto", "cabeça girando", "labirintite"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Tontura pode ter várias causas — desde labirintite até problemas mais sérios. Se a tontura for acompanhada de dor de cabeça, visão dupla, fraqueza ou dificuldade para falar, busque emergência. Caso contrário, uma UPA pode avaliar e orientar o tratamento.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-03",
    keywords: ["febre", "febre e tosse", "febre e dor", "gripe", "gripe forte", "resfriado forte", "dor no corpo", "dor no corpo febre"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Febre com sintomas gripais pode ser avaliada em uma UPA. Se houver falta de ar, febre acima de 39°C por mais de 3 dias, ou sinais de desidratação, a UPA é a indicação. Para sintomas leves sem complicação, uma UBS também pode atender.",
    warning_signs: [],
    source: "Protocolo de Manejo de Síndrome Gripal — Ministério da Saúde",
  },
  {
    id: "mod-04",
    keywords: ["dor de barriga forte", "dor abdominal", "dor de estômago", "vômito frequente", "diarreia intensa", "desidratação"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Dor abdominal forte, vômitos frequentes ou diarreia intensa com risco de desidratação devem ser avaliados em uma UPA. Se houver sangue nas fezes ou vômito, dor localizada e muito intensa, ou febre alta, considere emergência.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-05",
    keywords: ["infecção na pele", "ferida infeccionada", "abscesso", "caroço quente", "vermelhidão com pus", "picada de inseto reação"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Infecções de pele com pus, calor local e vermelhidão que se espalha devem ser avaliadas na UPA. Se a infecção estiver acompanhada de febre, linhas vermelhas se alastrando ou dor intensa, não demore a procurar atendimento.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-06",
    keywords: ["dor de ouvido", "ouvido inflamado", "ouvido pingando", "otite", "dor no ouvido"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Dor de ouvido pode ser avaliada em uma UPA. Se houver saída de pus, sangramento, ou inchaço atrás do ouvido, procure atendimento. Para crianças pequenas com febre e dor de ouvido, a UPA é uma boa opção para avaliação rápida.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-07",
    keywords: ["dor nas costas", "dor lombar forte", "dor na coluna", "ciática", "não consegue andar de dor"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Dor nas costas forte que limita movimentos ou irradia para pernas pode ser avaliada na UPA. Se houver perda de sensibilidade, dificuldade para controlar urina ou fezes, ou a dor veio após trauma, procure emergência.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-08",
    keywords: ["ansiedade forte", "crise de ansiedade", "ataque de pânico", "pânico", "ansiedade", "nervosismo extremo"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Crises de ansiedade e pânico podem ser muito desconfortáveis, mas não são fatalmente perigosas. A UPA pode ajudar com acalmamento e encaminhamento. Em caso de pensamentos suicidas, ligue 188 (CVV) ou procure emergência.",
    warning_signs: [],
    source: "CVV — Centro de Valorização da Vida (188)",
  },

  // ==================== LEVE / UBS ====================
  {
    id: "leve-01",
    keywords: ["tosse", "tosse seca", "coriza", "nariz entupido", "resfriado", "espirro", "garganta inflamada", "dor de garganta"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Sintomas de resfriado comum (tosse, coriza, dor de garganta leve) podem ser avaliados na UBS mais próxima. Se houver falta de ar, febre alta ou os sintomas piorarem, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-02",
    keywords: ["dor de cabeça", "cefaleia", "dor de cabeça leve", "dor de cabeça frequente"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Dor de cabeça leve ou frequente, sem outros sintomas preocupantes, pode ser avaliada na UBS. Se a dor for repentina e extrema, ou acompanhada de visão embaçada, confusão ou fraqueza, busque emergência.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-03",
    keywords: ["alergia", "rinite", "coceira", "alergia na pele", "pouco chiado no peito", "espirrando muito"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Sintomas alérgicos leves (rinite, coceira, espirros) podem ser manejados na UBS. Se houver inchaço na garganta, lábios ou língua, ou dificuldade para respirar, procure emergência imediatamente — pode ser anafilaxia.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-04",
    keywords: ["ferida pequena", "corte superficial", "arranhão", "escoriação", "picada de inseto", "queimadura leve", "pequena queimadura"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Ferimentos superficiais, arranhões e queimaduras leves podem ser tratados na UBS. Se a ferida for profunda, não parar de sangrar, ou houver risco de infecção, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-05",
    keywords: ["verme", "parasita", "coceira anal", "lombriga", "piolho", "sarna"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Problemas parasitários comuns podem ser tratados na UBS com medicação adequada. A UBS também realiza orientação sobre prevenção e higiene. Marque uma consulta se os sintomas persistirem.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-06",
    keywords: ["pressão alta", "hipertensão", "medir pressão", "consulta pressão", "checkup"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Acompanhamento de pressão arterial e check-ups de rotina podem ser feitos na UBS. Se a pressão estiver muito alta (acima de 180x120) acompanhada de dor de cabeça, visão embaçada ou tontura, procure uma UPA ou emergência.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-07",
    keywords: ["diabetes", "açúcar no sangue", "glicemia", "insulina", "consulta diabetes", "receita remédio"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Acompanhamento de diabetes e renovação de receitas podem ser feitos na UBS. Se houver sintomas como desmaio, confusão, sede excessiva ou vômitos, procure uma UPA, pois podem ser sinais de descompensação.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-08",
    keywords: ["vacina", "vacinação", "tomar vacina", "cartão de vacina", "vacina covid", "vacina gripe"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Vacinação é um serviço oferecido na UBS. Verifique se sua UBS tem o imunizante disponível. Leve seu cartão de vacina e documento de identificação.",
    warning_signs: [],
    source: "Programa Nacional de Imunizações — Ministério da Saúde",
  },
  {
    id: "leve-09",
    keywords: ["exame de sangue", "exame de urina", "pedir exame", "resultado de exame", "consulta de retorno"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Solicitação de exames de rotina, entrega de resultados e consultas de retorno são serviços da UBS. Verifique os horários de funcionamento da sua unidade mais próxima.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-10",
    keywords: ["gravidez", "pré-natal", "gestante", "teste de gravidez", "suspeita de gravidez"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Pré-natal é realizado na UBS. Se estiver grávida ou suspeita de gravidez, procure a UBS para iniciar o acompanhamento. Se houver sangramento, dor forte ou perda de líquido, procure uma UPA ou emergência.",
    warning_signs: [],
    source: "Programa de Humanização do Pré-Natal — Ministério da Saúde",
  },

  // ==================== LEVE (expandido) ====================
  {
    id: "leve-11",
    keywords: ["coceira", "coceira na pele", "comichao", "comichão", "coçando"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Coceira na pele sem outros sintomas pode ser avaliada na UBS. Pode ser alergia, irritação ou problema dermatológico simples. Se houver inchaço, difficulty para respirar ou a coceira for generalizada com urticária, procure emergência.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-12",
    keywords: ["pé gelado", "mão gelada", "extremidade fria", "pés frios"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Pés e mãos gelados sem outros sintomas geralmente não são preocupantes e podem estar relacionados a circulação ou temperatura ambiente. A UBS pode avaliar se houver outros sintomas associados.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-13",
    keywords: ["corte superficial", "cortinho", "corte pequeno", "arranhão leve"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Cortes superficiais podem ser tratados na UBS com limpeza e curativo. Se o corte for profundo, não parar de sangrar, ou estiver em região sensível, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-14",
    keywords: ["rash", "mancha na pele", "vermelhidão na pele", "manchas vermelhas"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Manchas ou vermelhidão na pele sem outros sintomas podem ser avaliadas na UBS. Se as manchas forem acompanhadas de febre, dor ou espalharem rapidamente, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-15",
    keywords: ["olho vermelho", "olho inflamado", "vermelhidão no olho"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Olho vermelho sem dor intensa ou perda de visão pode ser avaliado na UBS. Se houver dor forte, secreção abundante, sensibilidade à luz ou alteração da visão, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-16",
    keywords: ["dor articular", "dor nas juntas", "dor no joelho", "dor no ombro", "dor no cotovelo"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Dor articular sem trauma ou inchaço pode ser acompanhada na UBS. Se a dor for intensa, limitar movimentos, ou vier acompanhada de febre ou vermelhidão, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-17",
    keywords: ["dor de dente", "dente doendo", "dor na gengiva", "dor de dente leve"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Dor de dente pode ser avaliada na UBS, que pode encaminhar para atendimento odontológico. Se houver inchaço no rosto, febre ou dificuldade para engolir, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },
  {
    id: "leve-18",
    keywords: ["dor de barriga leve", "dor na barriga", "barriga doendo", "dor abdominal leve"],
    level: "leve",
    facility_type: "ubs",
    guidance: "Dor abdominal leve sem vômito ou febre pode ser avaliada na UBS. Se a dor piorar, vier acompanhada de vômito, febre ou sangue nas fezes, procure uma UPA.",
    warning_signs: [],
    source: "Caderno de Atenção Básica — Ministério da Saúde",
  },

  // ==================== MODERADO (expandido) ====================
  {
    id: "mod-09",
    keywords: ["dor de cabeça 3 dias", "dor de cabeça persistente", "cefaleia 3 dias", "dor de cabeça há dias"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Dor de cabeça que persiste por 3 ou mais dias deve ser avaliada na UPA. Pode indicar enxaqueca crônica, tensão ou outro problema que precisa de investigação.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-10",
    keywords: ["formigamento", "dormência", "braço dormente", "perna dormente", "formigando"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Formigamento ou dormência pode indicar problema neurológico ou circulatório. Se for súbito, afetar um lado do corpo, ou vier com fraqueza e dificuldade para falar, considere emergência (sinais de AVC). Caso contrário, UPA para avaliação.",
    warning_signs: ["Se for súbito e unilateral, pode ser sinal de AVC"],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-11",
    keywords: ["mordida de cachorro", "mordida de animal", "mordida de gato", "arranhão de animal"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Mordida de animal requer avaliação na UPA para limpeza adequada, avaliação de risco de infecção e profilaxia antirrábica se necessário. Lave bem o local com água e sabão por pelo menos 15 minutos antes de procurar atendimento.",
    warning_signs: [],
    source: "Protocolo de Profilaxia Antirrábica — Ministério da Saúde",
  },
  {
    id: "mod-12",
    keywords: ["dor no peito leve", "pontada no peito", "peito aperta pouco"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Dor no peito leve ou pontada que piora com respiração pode ser avaliada na UPA. Se a dor for em aperto, vier com suor frio, falta de ar ou irradiar para braço esquerdo, vá para emergência imediatamente.",
    warning_signs: ["Se piorar, pode ser emergência cardíaca"],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-13",
    keywords: ["vômito", "vomitando", "vomito", "está vomitando", "náusea forte"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Vômitos frequentes podem causar desidratação e devem ser avaliados na UPA. Se houver sangue no vômito, dor abdominal intensa ou não conseguir se hidratar, não demore a procurar atendimento.",
    warning_signs: [],
    source: "Classificação de Risco — Ministério da Saúde",
  },
  {
    id: "mod-14",
    keywords: ["infecção urinária", "ardência ao urinar", "dor ao urinar", "urina com sangue", "pinando"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Sintomas de infecção urinária (ardência, dor, urgência) devem ser avaliados na UPA para prescrição de antibiótico. Se houver febre alta ou dor lombar, pode ser uma infecção renal mais grave.",
    warning_signs: [],
    source: "Protocolo de Manejo de ITU — Ministério da Saúde",
  },
  {
    id: "mod-15",
    keywords: ["tosse persistente", "tosse há uma semana", "tosse que não passa", "tosse com catarro"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Tosse que persiste por mais de uma semana deve ser avaliada na UPA. Pode ser infecção respiratória, bronquite ou outro problema que precisa de investigação.",
    warning_signs: [],
    source: "Protocolo de Manejo de Síndrome Gripal — Ministério da Saúde",
  },
  {
    id: "mod-16",
    keywords: ["bicheira", "miíase", "larva na pele", "bicho de pé", "berne"],
    level: "moderado",
    facility_type: "upa",
    guidance: "Bicheira (miíase) requer remoção adequada na UPA. Não tente retirar em casa. A UPA tem os instrumentos e medicamentos necessários para remoção segura e prevenção de infecção.",
    warning_signs: [],
    source: "Protocolo de Manejo de Feridas — Ministério da Saúde",
  },

  // ==================== URGENTE (expandido) ====================
  {
    id: "emer-11",
    keywords: ["objeto perfurante", "espetou", "prego", "ferro na pele", "objeto cravado"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Objeto perfurante cravado no corpo não deve ser removido em casa. Vá à emergência imediatamente. A remoção inadequada pode causar sangramento grave ou lesão adicional. Imobilize a área e não aplique pressão direta sobre o objeto.",
    warning_signs: ["Risco de sangramento grave ao remover"],
    source: "Protocolo de Manchester — Categoria Laranja",
  },
  {
    id: "emer-12",
    keywords: ["queimadura grave", "queimadura extensa", "queimadura profunda", "queimadura de terceiro grau"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Queimaduras graves, extensas ou profundas requerem emergência imediata. Não passe pasta de dente, manteiga ou qualquer substância na queimadura. Resfrie com água corrente por 20 minutos e vá ao pronto-socorro.",
    warning_signs: ["Queimadura extensa ou profunda"],
    source: "Protocolo de Manchester — Categoria Laranja/Vermelha",
  },
  {
    id: "emer-13",
    keywords: ["corte profundo", "ferimento profundo", "corte grande", "laceração"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Cortes profundos que podem precisar de pontos devem ser avaliados na emergência. Aplique pressão direta com pano limpo para conter o sangramento e vá ao pronto-socorro o mais rápido possível.",
    warning_signs: ["Sangramento que não para com pressão"],
    source: "Protocolo de Manchester — Categoria Laranja",
  },
  {
    id: "emer-14",
    keywords: ["engasgou", "engasgo", "sufocando", "algo na garganta", "não consegue engolir objeto"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Engasgo com obstrução das vias aéreas é uma emergência. Se a pessoa não conseguir falar, tossir ou respirar, aplique a manobra de Heimlich imediatamente ou ligue 192 (SAMU). Não dê água ou comida.",
    warning_signs: ["Obstrução das vias aéreas"],
    source: "Protocolo de Suporte Básico de Vida — SAMU",
  },
  {
    id: "emer-15",
    keywords: ["picada de cobra", "cobra picou", "picada de cobra venenosa", "serpente", "picado por cobra", "cobra me mordeu", "mordeu por cobra"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Picada de cobra é emergência. Não faça torniquete, não corte o local, não chupe o veneno. Mantenha a pessoa calma e imóvel, ligue 192 (SAMU) e leve à emergência. Se possível, fotografe a cobra para identificação.",
    warning_signs: ["Veneno pode causar necrose ou systemic effects"],
    source: "Protocolo de Acidentes Ofídicos — Ministério da Saúde",
  },
  {
    id: "emer-16",
    keywords: ["olho com sangue", "sangue no olho", "olho sangrando", "trauma no olho", "ferida no olho"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Sangramento ou trauma no olho requer emergência. Não tente remover objetos do olho. Cubra ambos os olhos suavemente (para evitar movimento do olho afetado) e vá ao pronto-socorro imediatamente.",
    warning_signs: ["Risco de perda visual"],
    source: "Protocolo de Manchester — Categoria Vermelha",
  },
  {
    id: "emer-17",
    keywords: ["choque elétrico", "tomou choque", "eletrocução", "choque de alta voltagem"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Choque elétrico pode causar lesões internas invisíveis. Mesmo que a pessoa pareça bem, vá à emergência. O choque pode causar arritmia cardíaca, queimaduras internas e outras lesões que só aparecem horas depois.",
    warning_signs: ["Lesões internas podem não ser visíveis"],
    source: "Protocolo de Manchester — Categoria Vermelha",
  },
  {
    id: "emer-18",
    keywords: ["queda de altura", "caiu de altura", "caiu da escada", "caiu do telhado"],
    level: "urgente",
    facility_type: "emergencia",
    guidance: "Queda de altura pode causar fraturas, trauma craniano ou lesões internas. Não mova a pessoa se houver suspeita de lesão na coluna. Ligue 192 (SAMU) e aguarde socorro. Mantenha a pessoa aquecida e consciente.",
    warning_signs: ["Risco de fratura ou trauma craniano"],
    source: "Protocolo de Manchester — Categoria Laranja/Vermelha",
  },

  // ==================== DIRECIONAMENTO DIRETO (sem sintoma) ====================
  // Essas entradas cobrem perguntas como "qual hospital mais proximo?",
  // "qual UBS mais proxima?", "qual SPA/policlinica mais proxima?" etc.
  // O facility_type define QUAL TIPO de unidade o pipeline priorizará nos resultados.

  // --- Genérica: "unidades de saúde perto/próximas" (sem tipo específico) ---
  {
    id: "dir-00",
    keywords: [
      "unidades de saude", "unidade de saude",
      "unidades de saude perto", "unidades de saude proximas",
      "unidade de saude mais proxima", "unidades perto",
      "onde tem unidade de saude", "onde tem unidades de saude",
    ],
    level: "leve",
    facility_type: "ubs",
    guidance:
      "Vamos mostrar as unidades de saúde mais próximas de você. Se quiser uma recomendação do tipo adequado (UBS, UPA ou emergência), descreva seus sintomas.",
    warning_signs: [],
    source: "Dados públicos georreferenciados",
  },

  // --- UBS ---
  {
    id: "dir-01",
    keywords: [
      "tem ubs perto", "uba perto", "unidade básica",
      "posto de saúde perto", "onde tem ubs",
      "qual ubs", "ubs mais próxima", "ubs mais proxima",
      "ubs mais próximo", "ubs mais proximo",
    ],
    level: "leve",
    facility_type: "ubs",
    guidance: "Vamos localizar a UBS mais próxima de você. Informe sua localização no campo acima para encontrar as unidades de saúde disponíveis na sua região.",
    warning_signs: [],
    source: "Dados públicos georreferenciados",
  },

  // --- Hospitais / Emergência ---
  {
    id: "dir-02",
    keywords: [
      "hospital mais próximo", "hospital mais proximo", "qual hospital",
      "emergência perto", "emergencia perto", "onde tem hospital",
      "pronto socorro perto", "pronto socorro mais proximo", "pronto socorro mais próximo",
      "onde tem pronto socorro", "qual pronto socorro",
    ],
    level: "moderado",
    facility_type: "emergencia",
    guidance: "Vamos localizar hospitais e emergências próximas a você. Informe sua localização (bairro, rua ou CEP) para encontrar as opções mais próximas.",
    warning_signs: [],
    source: "Dados públicos georreferenciados",
  },

  // --- UPA ---
  {
    id: "dir-03",
    keywords: [
      "upa perto", "upa mais próxima", "upa mais proxima",
      "qual upa", "onde tem upa", "upa mais próximo", "upa mais proximo",
    ],
    level: "moderado",
    facility_type: "upa",
    guidance: "Vamos localizar a UPA mais próxima de você. Informe sua localização para encontrar as unidades de pronto atendimento disponíveis.",
    warning_signs: [],
    source: "Dados públicos georreferenciados",
  },

  // --- SPA (Serviço de Pronto Atendimento) ---
  {
    id: "dir-04",
    keywords: [
      "spa perto", "spa mais próximo", "spa mais proximo",
      "qual spa", "onde tem spa", "spa mais próxima", "spa mais proxima",
    ],
    level: "moderado",
    facility_type: "upa",
    guidance: "Vamos localizar o SPA (Serviço de Pronto Atendimento) mais próximo de você. Informe sua localização para encontrar as unidades disponíveis.",
    warning_signs: [],
    source: "Dados públicos georreferenciados",
  },

  // --- SPA + Policlínica (combinado, ex: "qual SPA/policlinica mais proxima?") ---
  // ORDEM IMPORTANTE: esta entrada vem ANTES de dir-05 (só policlínica) porque
  // no empate de score a primeira entrada da base vence. Quando o usuário
  // digita a frase combinada, a entrada combinada deve ganhar.
  {
    id: "dir-06",
    keywords: [
      "spa/policlinica", "spa/policlínica", "spa / policlinica", "spa / policlínica",
      "policlinica/spa", "policlínica/spa",
    ],
    level: "moderado",
    facility_type: "upa",
    guidance: "Vamos localizar SPAs e policlínicas próximas a você. Informe sua localização para encontrar as unidades disponíveis. SPAs atendem urgências de média complexidade; policlínicas oferecem consultas especializadas.",
    warning_signs: [],
    source: "Dados públicos georreferenciados",
  },

  // --- Policlínica ---
  {
    id: "dir-05",
    keywords: [
      "policlínica perto", "policlinica perto", "policlínica mais próxima",
      "policlinica mais proxima", "qual policlínica", "qual policlinica",
      "onde tem policlínica", "onde tem policlinica",
    ],
    level: "leve",
    facility_type: "ubs",
    guidance: "Vamos localizar a policlínica mais próxima de você. Informe sua localização para encontrar as unidades disponíveis.",
    warning_signs: [],
    source: "Dados públicos georreferenciados",
  },
];

/**
 * Busca na base de conhecimento por palavras-chave.
 * Retorna a melhor correspondência (maior número de keywords encontradas) ou null.
 */
export function matchKnowledgeBase(message: string): HealthKnowledgeEntry | null {
  const normalizedMsg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let bestMatch: HealthKnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of HEALTH_KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      const normalizedKw = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedMsg.includes(normalizedKw)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  // Só retorna se pelo menos 1 keyword bateu
  return bestScore > 0 ? bestMatch : null;
}