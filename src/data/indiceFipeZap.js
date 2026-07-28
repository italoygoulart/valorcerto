/**
 * ÍNDICE FIPEZAP - GOIÂNIA
 * ========================
 *
 * ATENÇÃO DESENVOLVEDOR / OPERADOR:
 * Os valores abaixo são VALORES DE EXEMPLO para estrutura do sistema.
 * Antes de qualquer uso comercial, substituir pelos valores reais
 * publicados pelo FipeZAP, através do painel administrativo (/admin).
 *
 * O índice é atualizado MANUALMENTE, com periodicidade mensal.
 * Toda estimativa exibe a data de referência do índice usado.
 *
 * Fonte oficial: https://www.fipe.org.br/pt-br/indices/fipezap
 */

// Data de referência do índice atualmente carregado.
// Atualizar SEMPRE junto com os valores.
export const DATA_REFERENCIA = '2026-06';

// Margem de erro declarada da estimativa.
// A estimativa gratuita é referencial: sempre exibida como FAIXA, nunca
// como número exato. Ver disclaimers em src/lib/disclaimers.js
export const MARGEM_ERRO = 0.08; // ±8%

/**
 * MAPEAMENTO BAIRRO → REGIÃO DE REFERÊNCIA
 *
 * DECISÃO DE PRODUTO PENDENTE:
 * O FipeZAP não publica índice bairro a bairro para Goiânia. Este
 * agrupamento por região é uma aproximação e DEVE ser revisado pelo
 * corretor responsável, que conhece o mercado local.
 *
 * O agrupamento impacta diretamente a credibilidade da estimativa.
 */
export const REGIOES = {
  ALTO_PADRAO: 'Alto padrão',
  CENTRAL: 'Central',
  NORTE: 'Norte',
  SUL: 'Sul',
  LESTE: 'Leste',
  OESTE: 'Oeste',
};

export const MAPA_BAIRROS = {
  // Região de alto padrão
  'Jardim Goiás': REGIOES.ALTO_PADRAO,
  'Setor Marista': REGIOES.ALTO_PADRAO,
  'Setor Bueno': REGIOES.ALTO_PADRAO,
  'Setor Oeste': REGIOES.ALTO_PADRAO,
  'Alphaville': REGIOES.ALTO_PADRAO,
  'Jardins Munique': REGIOES.ALTO_PADRAO,
  'Jardins Viena': REGIOES.ALTO_PADRAO,
  'Jardins Paris': REGIOES.ALTO_PADRAO,

  // Central
  'Setor Central': REGIOES.CENTRAL,
  'Setor Aeroporto': REGIOES.CENTRAL,
  'Setor Coimbra': REGIOES.CENTRAL,
  'Setor Universitário': REGIOES.CENTRAL,

  // Norte
  'Setor Negrão de Lima': REGIOES.NORTE,
  'Parque das Laranjeiras': REGIOES.NORTE,
  'Jardim Guanabara': REGIOES.NORTE,
  'Setor Urias Magalhães': REGIOES.NORTE,

  // Sul
  'Setor Pedro Ludovico': REGIOES.SUL,
  'Jardim Novo Mundo': REGIOES.SUL,
  'Setor Sul': REGIOES.SUL,
  'Vila Redenção': REGIOES.SUL,

  // Leste
  'Setor Leste Vila Nova': REGIOES.LESTE,
  'Jardim América': REGIOES.LESTE,
  'Setor Jaó': REGIOES.LESTE,

  // Oeste
  'Setor Campinas': REGIOES.OESTE,
  'Vila Nova': REGIOES.OESTE,
  'Setor Criméia Oeste': REGIOES.OESTE,
};

/**
 * VALOR DO M² POR REGIÃO E TIPO DE IMÓVEL (R$/m²)
 *
 * `apartamento`: ANCORADO NO DADO REAL. O FipeZAP publica, para Goiânia,
 * só um índice único da cidade (sem quebra por bairro/região — conferido
 * direto na planilha oficial: https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx,
 * aba "Goiânia"). Preço médio de venda, junho/2026: R$ 8.352/m² (Total).
 * Os valores abaixo preservam a diferença relativa entre regiões que já
 * existia (Alto padrão bem acima da média, Norte/Oeste abaixo), mas
 * reescalados para que a média das 6 regiões bata com esse número real.
 *
 * `casa` e `terreno`: AINDA SÃO VALORES DE EXEMPLO — o FipeZAP cobre
 * apenas apartamentos prontos, não tem nenhum dado oficial para casa ou
 * terreno. Substituir por fonte própria (matrícula, IPTU, corretor local)
 * antes do uso comercial.
 */
export const VALOR_M2 = {
  [REGIOES.ALTO_PADRAO]: { apartamento: 13500, casa: 8200, terreno: 3400 },
  [REGIOES.CENTRAL]: { apartamento: 8800, casa: 5100, terreno: 2200 },
  [REGIOES.NORTE]: { apartamento: 6700, casa: 4300, terreno: 1600 },
  [REGIOES.SUL]: { apartamento: 7700, casa: 4800, terreno: 1900 },
  [REGIOES.LESTE]: { apartamento: 7100, casa: 4500, terreno: 1750 },
  [REGIOES.OESTE]: { apartamento: 6300, casa: 4100, terreno: 1500 },
};

// Região usada quando o bairro informado não está mapeado.
// O sistema SEMPRE sinaliza ao usuário quando cai no fallback.
export const REGIAO_FALLBACK = REGIOES.CENTRAL;

/**
 * FATORES DE AJUSTE
 * Multiplicadores aplicados sobre o valor base do m².
 */
export const FATORES = {
  // Padrão de acabamento
  padrao: {
    simples: 0.85,
    medio: 1.0,
    alto: 1.18,
    luxo: 1.35,
  },

  // Idade do imóvel (depreciação)
  idade: {
    novo: 1.0,          // até 2 anos
    seminovo: 0.95,     // 3 a 10 anos
    usado: 0.88,        // 11 a 25 anos
    antigo: 0.78,       // acima de 25 anos
  },

  // Vagas de garagem: acréscimo por vaga sobre o valor total
  vagaGaragem: 0.04,
};

export const TIPOS_IMOVEL = [
  { id: 'apartamento', label: 'Apartamento' },
  { id: 'casa', label: 'Casa' },
  { id: 'terreno', label: 'Terreno' },
];

export const PADROES = [
  { id: 'simples', label: 'Simples' },
  { id: 'medio', label: 'Médio' },
  { id: 'alto', label: 'Alto' },
  { id: 'luxo', label: 'Luxo' },
];

export const IDADES = [
  { id: 'novo', label: 'Novo (até 2 anos)' },
  { id: 'seminovo', label: 'Seminovo (3 a 10 anos)' },
  { id: 'usado', label: 'Usado (11 a 25 anos)' },
  { id: 'antigo', label: 'Antigo (acima de 25 anos)' },
];

export const LISTA_BAIRROS = Object.keys(MAPA_BAIRROS).sort();

/** Rótulo do campo de área conforme o tipo de imóvel. */
export function rotuloArea(tipo) {
  if (tipo === 'terreno') return 'Área do terreno';
  if (tipo === 'casa') return 'Área construída';
  return 'Área privativa';
}
