/*
 * Dados da grade de Engenharia da Computação (lidos do fluxograma em PDF).
 * Para corrigir algo da grade, edite apenas este arquivo.
 *
 * CAT: [código, nome, horas, coluna (semestre - 1), linha no fluxograma]
 * PRE: { destino: [pré-requisitos] }  — lido das setas do PDF
 * BASE_*: situação marcada no PDF (rosa = concluída, verde = cursando, azul = planejada)
 */
const GRADE = {
  CAT: [
    ["01", "Introdução à Engenharia da Computação", 34, 0, 4],
    ["02", "Fundamentos da Matemática", 68, 0, 0],
    ["03", "Cálculo Vetorial e Geometria Analítica", 68, 0, 2],
    ["04", "Química Geral e Ciência dos Materiais", 34, 0, 3],
    ["05", "Desenho Técnico em Ambiente Computacional", 34, 0, 1],
    ["06", "Algoritmos I", 68, 0, 5],
    ["07", "Economia", 34, 0, 6],

    ["08", "Cálculo Diferencial e Integral I", 68, 1, 0],
    ["09", "Física Geral e Experimental I", 68, 1, 1],
    ["10", "Álgebra Linear", 68, 1, 2],
    ["11", "Metodologia Científica", 34, 1, 3],
    ["12", "Arquitetura e Organização de Computadores", 68, 1, 4],
    ["13", "Algoritmos II", 68, 1, 5],
    ["14", "Ciências do Ambiente", 34, 1, 6],

    ["15", "Cálculo Diferencial e Integral II", 68, 2, 0],
    ["16", "Física Geral e Experimental II", 68, 2, 1],
    ["17", "Eletrônica Digital", 68, 2, 2],
    ["18", "Introdução à Extensão", 34, 2, 3],
    ["19", "Sistemas Operacionais", 68, 2, 4],
    ["20", "Estruturas de Dados", 68, 2, 5],
    ["21", "Probabilidade e Estatística Computacional", 34, 2, 6],

    ["22", "Equações Diferenciais", 68, 3, 0],
    ["23", "Física Geral e Experimental III", 68, 3, 1],
    ["24", "Cálculo Numérico", 68, 3, 2],
    ["25", "Banco de Dados", 68, 3, 3],
    ["26", "Programação Orientada a Objetos", 68, 3, 4],
    ["27", "Matemática Discreta e Teoria dos Grafos", 34, 3, 5],
    ["28", "Transmissão e Comunicação de Dados", 68, 3, 6],

    ["35", "Ética Profissional", 34, 4, 0],
    ["31", "Circuitos Elétricos I", 68, 4, 1],
    ["32", "Laboratório de Circuitos Elétricos I", 34, 4, 2],
    ["33", "Extensão I", 102, 4, 3],
    ["34", "Engenharia de Software", 68, 4, 4],
    ["30", "Programação Web", 68, 4, 5],
    ["29", "Compiladores", 68, 4, 6],

    ["38", "Laboratório de Circuitos Elétricos II", 34, 5, 0],
    ["39", "Sinais e Sistemas Lineares", 68, 5, 1],
    ["37", "Circuitos Elétricos II", 68, 5, 2],
    ["36", "Eletrônica Analógica I", 68, 5, 3],
    ["40", "Análise e Projeto de Sistemas Computacionais", 68, 5, 4],
    ["41", "Inteligência Artificial", 68, 5, 5],
    ["42", "Redes de Computadores", 68, 5, 6],

    ["45", "Controle de Sistemas Contínuos I", 68, 6, 1],
    ["43", "Microcontroladores", 68, 6, 2],
    ["48", "Extensão II", 102, 6, 3],
    ["46", "Segurança do Trabalho", 34, 6, 4],
    ["47", "Mineração de Dados", 68, 6, 5],
    ["49", "Segurança de Sistemas de Computação", 34, 6, 6],
    ["44", "Eletrônica Analógica II", 68, 6, 7],

    ["50", "Processamento Digital de Sinais", 34, 7, 1],
    ["54", "Trabalho de Conclusão do Curso", 34, 7, 3],
    ["53", "Administração", 34, 7, 4],
    ["51", "Projeto de Sistemas Inteligentes", 68, 7, 5],
    ["52", "Disciplina Eletiva", 34, 7, 6],
  ],

  PRE: {
    "08": ["02"], "09": ["02"], "17": ["02"], "10": ["03"], "12": ["01"], "13": ["06"],
    "15": ["08"], "16": ["09"], "21": ["08"], "24": ["08"],
    "19": ["12"], "20": ["13"], "27": ["13"],
    "22": ["15"], "23": ["16"], "25": ["20"], "26": ["20"], "28": ["17"],
    "29": ["12", "26", "27"], "30": ["26"], "31": ["17", "23"], "32": ["17", "23"],
    "33": ["18"], "34": ["26"],
    "36": ["23"], "37": ["31"], "38": ["31"], "39": ["22", "31"], "40": ["34"],
    "41": ["21"], "42": ["28"], "43": ["37"], "44": ["29"], "45": ["39"],
    "47": ["41"], "48": ["33"], "49": ["42"], "50": ["39"], "51": ["47"], "54": ["48"],
  },

  BASE_DONE: ["01","02","03","04","06","07","08","09","10","11","12","13","14","15","16","18","19","20","21","23","24","25","26","27","29","30","31","32","35","38","39","41","46","50","52","53"],
  BASE_CUR: ["28", "33", "34", "37", "47"],
  BASE_PLAN: ["54"],
};
