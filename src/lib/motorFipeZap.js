/**
 * MOTOR DE AVALIAÇÃO GRATUITA — BASE FIPEZAP
 * ==========================================
 * Item 3.1 do briefing técnico.
 *
 * Calcula uma estimativa referencial cruzando: tipo de imóvel, região
 * (derivada do bairro), área privativa, padrão de acabamento, idade e
 * vagas de garagem.
 *
 * REGRA CENTRAL: a saída é sempre uma FAIXA de valor, nunca um número
 * único. Um número exato transmite precisão que o método não tem.
 */

import {
  MAPA_BAIRROS,
  VALOR_M2,
  FATORES,
  REGIAO_FALLBACK,
  MARGEM_ERRO,
  DATA_REFERENCIA,
} from '../data/indiceFipeZap.js';

/**
 * Resolve a região de referência a partir do bairro informado.
 * Sinaliza quando cai no fallback — isso precisa aparecer para o usuário.
 */
export function resolverRegiao(bairro) {
  const regiao = MAPA_BAIRROS[bairro];
  if (regiao) {
    return { regiao, usouFallback: false };
  }
  return { regiao: REGIAO_FALLBACK, usouFallback: true };
}

/**
 * Calcula a estimativa.
 *
 * @param {Object} dados
 * @param {string} dados.tipo       - 'apartamento' | 'casa' | 'terreno'
 * @param {string} dados.bairro
 * @param {number} dados.area       - área construída (casa/terreno) ou privativa (apartamento), em m²
 * @param {number} [dados.areaTotal] - área total do terreno, só para casas. O que exceder a área
 *                                     construída é precificado pelo valor de terreno da região.
 * @param {string} dados.padrao     - 'simples' | 'medio' | 'alto' | 'luxo'
 * @param {string} dados.idade      - 'novo' | 'seminovo' | 'usado' | 'antigo'
 * @param {number} dados.vagas      - número de vagas de garagem
 *
 * @returns {Object} estimativa com faixa, memória de cálculo e metadados
 */
export function calcularEstimativa(dados) {
  const { tipo, bairro, area, areaTotal, padrao, idade, vagas = 0 } = dados;

  // Validação de entrada — falha explícita é melhor que número errado
  if (!tipo || !bairro || !area || area <= 0) {
    throw new Error('Dados insuficientes para calcular a estimativa.');
  }

  const { regiao, usouFallback } = resolverRegiao(bairro);

  // 1. Valor base do m² para a região e tipo
  const valorM2Base = VALOR_M2[regiao]?.[tipo];
  if (!valorM2Base) {
    throw new Error(`Sem índice para ${tipo} na região ${regiao}.`);
  }

  // 2. Fatores de ajuste.
  //    Terreno não sofre ajuste de padrão nem de idade — não há construção.
  const ehTerreno = tipo === 'terreno';
  const fatorPadrao = ehTerreno ? 1.0 : (FATORES.padrao[padrao] ?? 1.0);
  const fatorIdade = ehTerreno ? 1.0 : (FATORES.idade[idade] ?? 1.0);

  // 3. Valor base antes das vagas
  const valorBase = area * valorM2Base * fatorPadrao * fatorIdade;

  // 4. Acréscimo por vaga de garagem (não se aplica a terreno)
  const fatorVagas = ehTerreno ? 0 : vagas * FATORES.vagaGaragem;
  const acrescimoVagas = valorBase * fatorVagas;

  // 4b. Terreno excedente — só para casas. A área construída já embute o
  //     valor do terreno sob a construção; o restante do lote (quintal,
  //     recuo, área livre) precisa ser precificado à parte, ou casas com
  //     lotes maiores ficam subavaliadas.
  const valorM2Terreno = VALOR_M2[regiao]?.terreno ?? 0;
  const areaTerrenoExcedente =
    tipo === 'casa' && areaTotal > area ? areaTotal - area : 0;
  const valorTerrenoExcedente = areaTerrenoExcedente * valorM2Terreno;

  const valorCentral = valorBase + acrescimoVagas + valorTerrenoExcedente;

  // 5. Faixa. Se caiu no fallback de região, a margem é ampliada,
  //    porque a incerteza é maior.
  const margem = usouFallback ? MARGEM_ERRO * 1.5 : MARGEM_ERRO;
  const valorMinimo = valorCentral * (1 - margem);
  const valorMaximo = valorCentral * (1 + margem);

  return {
    valorMinimo: Math.round(valorMinimo),
    valorMaximo: Math.round(valorMaximo),
    valorCentral: Math.round(valorCentral),
    margemAplicada: margem,
    dataReferencia: DATA_REFERENCIA,
    usouFallback,

    // Memória de cálculo: permite reconstruir como se chegou ao número.
    // Item 3.2 do briefing — exigência de auditabilidade.
    memoriaCalculo: {
      regiao,
      valorM2Base,
      area,
      fatorPadrao,
      fatorIdade,
      vagas,
      fatorVagas,
      valorBase: Math.round(valorBase),
      acrescimoVagas: Math.round(acrescimoVagas),
      areaTotal: areaTotal || null,
      areaTerrenoExcedente,
      valorM2Terreno,
      valorTerrenoExcedente: Math.round(valorTerrenoExcedente),
      formula:
        'area × valor_m2 × fator_padrao × fator_idade × (1 + vagas × 0,04)' +
        (areaTerrenoExcedente > 0 ? ' + (área_total − área) × valor_m2_terreno' : ''),
    },
  };
}

/** Formata valor em Real brasileiro. */
export function formatarBRL(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(valor);
}

/** Formata a data de referência (YYYY-MM) para exibição. */
export function formatarDataReferencia(ref) {
  const [ano, mes] = ref.split('-');
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return `${meses[Number(mes) - 1]} de ${ano}`;
}
