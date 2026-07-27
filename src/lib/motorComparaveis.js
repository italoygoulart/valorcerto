/**
 * MOTOR DE AVALIAÇÃO POR COMPARAÇÃO DE MERCADO
 * ============================================
 * Item 3.2 do briefing técnico. Área paga (corretores CRECI).
 *
 * Inspirado no método comparativo direto de dados de mercado
 * (ABNT NBR 14653). Seleciona comparáveis, homogeneíza por fatores de
 * ajuste, trata outliers e devolve valor com intervalo de confiança.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ATENÇÃO DESENVOLVEDOR — PONTO DE INTEGRAÇÃO PENDENTE
 *
 * A função buscarComparaveis() está SIMULADA com dados de exemplo.
 * Em produção deve consumir uma API de busca web legítima.
 *
 * É VEDADO fazer scraping de portais imobiliários (ZAP, VivaReal, OLX).
 * Ver item 6.1 do briefing: risco jurídico e violação de termos de uso.
 *
 * Substituir apenas o corpo de buscarComparaveis(). A assinatura de
 * retorno deve ser mantida para não quebrar o restante do motor.
 * ─────────────────────────────────────────────────────────────────────
 */

const QTD_COMPARAVEIS = 4;

/**
 * Pesos de similaridade. Somam 1,0.
 * Distância geográfica pesa mais: localização é o fator dominante
 * na formação de preço imobiliário.
 */
const PESOS_SIMILARIDADE = {
  distancia: 0.40,
  area: 0.30,
  padrao: 0.20,
  idade: 0.10,
};

/**
 * BUSCA DE COMPARÁVEIS — SIMULADA
 *
 * Retorna imóveis semelhantes ao avaliando. Cada comparável DEVE trazer
 * a fonte, para que o corretor veja de onde veio o dado (exigência de
 * transparência, item 3.2 do briefing).
 */
export async function buscarComparaveis(avaliando) {
  // Simulação: gera comparáveis em torno do imóvel avaliando, com
  // variação realista. Substituir por chamada real de API.
  const base = avaliando.valorM2Estimado || 6000;
  const variacoes = [0.94, 1.06, 0.89, 1.12, 0.97, 1.03];

  await new Promise((r) => setTimeout(r, 600)); // simula latência de rede

  return variacoes.slice(0, 6).map((v, i) => ({
    id: `sim-${i + 1}`,
    endereco: `${avaliando.bairro} — imóvel de referência ${i + 1}`,
    bairro: avaliando.bairro,
    tipo: avaliando.tipo,
    area: Math.round(avaliando.area * (0.85 + Math.random() * 0.3)),
    padrao: avaliando.padrao,
    idade: avaliando.idade,
    vagas: avaliando.vagas,
    valorAnuncio: Math.round(avaliando.area * base * v),
    distanciaKm: Number((Math.random() * 3).toFixed(1)),
    fonte: 'DADO SIMULADO — substituir por API de busca',
    urlFonte: null,
    dataColeta: new Date().toISOString().slice(0, 10),
  }));
}

/** Calcula quão similar um comparável é do avaliando. 0 a 1. */
export function calcularSimilaridade(avaliando, comp) {
  // Distância: 0 km = 1,0 / 5 km ou mais = 0
  const sDistancia = Math.max(0, 1 - comp.distanciaKm / 5);

  // Área: penaliza diferença proporcional
  const difArea = Math.abs(comp.area - avaliando.area) / avaliando.area;
  const sArea = Math.max(0, 1 - difArea);

  // Padrão e idade: binário (igual ou diferente)
  const sPadrao = comp.padrao === avaliando.padrao ? 1 : 0.6;
  const sIdade = comp.idade === avaliando.idade ? 1 : 0.7;

  return (
    sDistancia * PESOS_SIMILARIDADE.distancia +
    sArea * PESOS_SIMILARIDADE.area +
    sPadrao * PESOS_SIMILARIDADE.padrao +
    sIdade * PESOS_SIMILARIDADE.idade
  );
}

/**
 * Remove outliers pelo critério de amplitude interquartil (IQR).
 * Anúncio com preço fora da curva distorce a média e é comum no mercado
 * (imóvel com preço "de sonho" ou erro de digitação).
 */
export function removerOutliers(comparaveis) {
  if (comparaveis.length < 4) return { mantidos: comparaveis, removidos: [] };

  const valores = comparaveis.map((c) => c.valorM2).sort((a, b) => a - b);
  const q1 = valores[Math.floor(valores.length * 0.25)];
  const q3 = valores[Math.floor(valores.length * 0.75)];
  const iqr = q3 - q1;
  const limiteInferior = q1 - 1.5 * iqr;
  const limiteSuperior = q3 + 1.5 * iqr;

  const mantidos = [];
  const removidos = [];
  for (const c of comparaveis) {
    if (c.valorM2 < limiteInferior || c.valorM2 > limiteSuperior) {
      removidos.push({ ...c, motivoExclusao: 'Outlier (critério IQR)' });
    } else {
      mantidos.push(c);
    }
  }
  return { mantidos, removidos };
}

/**
 * Avaliação completa por comparação de mercado.
 *
 * @param {Object} avaliando - dados do imóvel a avaliar
 * @param {Array} comparaveisManuais - se fornecido, ignora a busca automática
 *                (o corretor pode editar a seleção — item 3.2 do briefing)
 */
export async function avaliarPorComparaveis(avaliando, comparaveisManuais = null) {
  // 1. Obter candidatos
  let candidatos = comparaveisManuais || (await buscarComparaveis(avaliando));

  // 2. Calcular valor por m² e similaridade de cada um
  candidatos = candidatos.map((c) => ({
    ...c,
    valorM2: Math.round(c.valorAnuncio / c.area),
    similaridade: calcularSimilaridade(avaliando, c),
  }));

  // 3. Remover outliers
  const { mantidos, removidos } = removerOutliers(candidatos);

  // 4. Selecionar os N mais similares
  const selecionados = mantidos
    .sort((a, b) => b.similaridade - a.similaridade)
    .slice(0, QTD_COMPARAVEIS);

  if (selecionados.length === 0) {
    throw new Error('Nenhum comparável válido encontrado para este imóvel.');
  }

  // 5. Média ponderada pela similaridade
  const somaPesos = selecionados.reduce((s, c) => s + c.similaridade, 0);
  const valorM2Ponderado =
    selecionados.reduce((s, c) => s + c.valorM2 * c.similaridade, 0) / somaPesos;

  const valorEstimado = valorM2Ponderado * avaliando.area;

  // 6. Intervalo de confiança pelo desvio-padrão da amostra.
  //    Amostra dispersa = intervalo largo. Isso é honesto: significa que
  //    o mercado naquele recorte não é homogêneo.
  const media = selecionados.reduce((s, c) => s + c.valorM2, 0) / selecionados.length;
  const variancia =
    selecionados.reduce((s, c) => s + Math.pow(c.valorM2 - media, 2), 0) /
    selecionados.length;
  const desvioPadrao = Math.sqrt(variancia);
  const coefVariacao = desvioPadrao / media;

  // Intervalo mínimo de 8%, ampliado pela dispersão da amostra
  const margem = Math.max(0.08, coefVariacao);

  return {
    valorEstimado: Math.round(valorEstimado),
    valorMinimo: Math.round(valorEstimado * (1 - margem)),
    valorMaximo: Math.round(valorEstimado * (1 + margem)),
    valorM2Ponderado: Math.round(valorM2Ponderado),
    margem,
    grauConfianca: classificarConfianca(coefVariacao, selecionados.length),

    // MEMÓRIA DE CÁLCULO — registro auditável (item 3.2 do briefing)
    memoriaCalculo: {
      metodo: 'Comparação direta de dados de mercado (média ponderada por similaridade)',
      qtdCandidatos: candidatos.length,
      qtdSelecionados: selecionados.length,
      comparaveisUsados: selecionados.map((c) => ({
        endereco: c.endereco,
        area: c.area,
        valorAnuncio: c.valorAnuncio,
        valorM2: c.valorM2,
        distanciaKm: c.distanciaKm,
        similaridade: Number(c.similaridade.toFixed(3)),
        fonte: c.fonte,
        urlFonte: c.urlFonte,
        dataColeta: c.dataColeta,
      })),
      comparaveisExcluidos: removidos.map((c) => ({
        endereco: c.endereco,
        valorM2: c.valorM2,
        motivo: c.motivoExclusao,
      })),
      desvioPadrao: Math.round(desvioPadrao),
      coeficienteVariacao: Number(coefVariacao.toFixed(3)),
      pesosSimilaridade: PESOS_SIMILARIDADE,
      dataCalculo: new Date().toISOString(),
    },
  };
}

/** Classifica a confiança do resultado com base na dispersão e no tamanho da amostra. */
function classificarConfianca(coefVariacao, qtd) {
  if (qtd < 3) return { nivel: 'baixo', texto: 'Amostra pequena. Use com cautela.' };
  if (coefVariacao <= 0.10)
    return { nivel: 'alto', texto: 'Comparáveis homogêneos. Boa confiabilidade.' };
  if (coefVariacao <= 0.20)
    return { nivel: 'medio', texto: 'Dispersão moderada entre os comparáveis.' };
  return {
    nivel: 'baixo',
    texto: 'Comparáveis muito dispersos. Revise a seleção manualmente.',
  };
}
