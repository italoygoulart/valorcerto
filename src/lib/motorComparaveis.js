/**
 * MOTOR DE AVALIAÇÃO POR COMPARAÇÃO DE MERCADO
 * ============================================
 * Item 3.2 do briefing técnico. Área paga (corretores CRECI).
 *
 * Inspirado no método comparativo direto de dados de mercado
 * (ABNT NBR 14653). Seleciona comparáveis do mesmo bairro do avaliando,
 * descarta o mais caro e o mais barato do grupo, remove quem ainda ficar
 * fora de uma faixa de oscilação aceitável e devolve o valor médio
 * ponderado com intervalo de confiança.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ATENÇÃO DESENVOLVEDOR — PONTO DE INTEGRAÇÃO PENDENTE
 *
 * A função buscarComparaveis() está SIMULADA com dados de exemplo.
 * Em produção deve consumir uma API de busca web legítima, restrita ao
 * bairro do imóvel avaliando (não expandir para bairros vizinhos —
 * decisão de produto).
 *
 * É VEDADO fazer scraping de portais imobiliários (ZAP, VivaReal, OLX).
 * Ver item 6.1 do briefing: risco jurídico e violação de termos de uso.
 *
 * Substituir apenas o corpo de buscarComparaveis(). A assinatura de
 * retorno deve ser mantida para não quebrar o restante do motor.
 * ─────────────────────────────────────────────────────────────────────
 */

// Quantos comparáveis (dentre os mais similares) entram na análise antes
// do descarte de extremos. Com 6, o fluxo típico vira: 6 → descarta o
// mais caro e o mais barato → 4 usados na média ponderada.
const QTD_ALVO_COMPARAVEIS = 6;

// Faixa de oscilação aceitável em torno da média do grupo (depois de já
// descartados os dois extremos). Quem ficar fora é excluído também.
const LIMITE_OSCILACAO_GRUPO = 0.15;

// Faixa mínima e máxima exibida ao usuário/laudo, calculada a partir da
// dispersão real dos comparáveis usados (nunca menor que o piso, nunca
// maior que o teto).
const MARGEM_MINIMA = 0.08;
const MARGEM_MAXIMA = 0.15;

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
 * Retorna imóveis semelhantes ao avaliando, dentro do mesmo bairro. Cada
 * comparável DEVE trazer a fonte, para que o corretor veja de onde veio
 * o dado (exigência de transparência, item 3.2 do briefing).
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
 * Descarta o comparável mais caro e o mais barato do grupo (R$/m²).
 * Só descarta se houver massa suficiente (mínimo 4) para o corte de
 * dois extremos ainda deixar uma amostra útil.
 */
export function descartarExtremos(comparaveis) {
  if (comparaveis.length < 4) return { mantidos: comparaveis, removidos: [] };

  const ordenados = [...comparaveis].sort((a, b) => a.valorM2 - b.valorM2);
  const maisBarato = ordenados[0];
  const maisCaro = ordenados[ordenados.length - 1];

  const mantidos = comparaveis.filter((c) => c !== maisBarato && c !== maisCaro);
  const removidos = [maisBarato, maisCaro].map((c) => ({
    ...c,
    motivoExclusao: 'Extremo de preço (o mais caro ou o mais barato do grupo)',
  }));

  return { mantidos, removidos };
}

/**
 * Remove quem ficar fora de ±15% da média do grupo restante (depois do
 * descarte dos extremos). Garante que a faixa final reflete apenas
 * comparáveis com preço razoavelmente próximo entre si.
 */
export function filtrarForaDaFaixa(comparaveis, limite = LIMITE_OSCILACAO_GRUPO) {
  if (comparaveis.length === 0) return { mantidos: comparaveis, removidos: [] };

  const media = comparaveis.reduce((s, c) => s + c.valorM2, 0) / comparaveis.length;

  const mantidos = [];
  const removidos = [];
  for (const c of comparaveis) {
    const desvio = Math.abs(c.valorM2 - media) / media;
    if (desvio > limite) {
      removidos.push({
        ...c,
        motivoExclusao: `Fora da faixa de ±${Math.round(limite * 100)}% da média do grupo`,
      });
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
  // 1. Obter candidatos (sempre restritos ao bairro do avaliando — a
  //    busca simulada/real já parte desse recorte, não há expansão para
  //    bairros vizinhos)
  let candidatos = comparaveisManuais || (await buscarComparaveis(avaliando));

  // 2. Calcular valor por m² e similaridade de cada um
  candidatos = candidatos.map((c) => ({
    ...c,
    valorM2: Math.round(c.valorAnuncio / c.area),
    similaridade: calcularSimilaridade(avaliando, c),
  }));

  // 3. Manter só os mais similares (alvo de 6) — o resto nem entra na
  //    análise de preço, é descartado por falta de semelhança mesmo
  const ordenadosPorSimilaridade = [...candidatos].sort((a, b) => b.similaridade - a.similaridade);
  const preSelecionados = ordenadosPorSimilaridade.slice(0, QTD_ALVO_COMPARAVEIS);
  const descartadosPorSimilaridade = ordenadosPorSimilaridade
    .slice(QTD_ALVO_COMPARAVEIS)
    .map((c) => ({
      ...c,
      motivoExclusao: `Fora dos ${QTD_ALVO_COMPARAVEIS} comparáveis mais similares`,
    }));

  // 4. Descartar o mais caro e o mais barato do grupo pré-selecionado
  const { mantidos: semExtremos, removidos: extremos } = descartarExtremos(preSelecionados);

  // 5. Do que sobrou, remover quem ainda estiver fora de ±15% da média
  const { mantidos: selecionados, removidos: foraDaFaixa } = filtrarForaDaFaixa(semExtremos);

  if (selecionados.length === 0) {
    throw new Error('Nenhum comparável válido encontrado para este imóvel.');
  }

  // 6. Média ponderada pela similaridade
  const somaPesos = selecionados.reduce((s, c) => s + c.similaridade, 0);
  const valorM2Ponderado =
    selecionados.reduce((s, c) => s + c.valorM2 * c.similaridade, 0) / somaPesos;

  const valorEstimado = valorM2Ponderado * avaliando.area;

  // 7. Intervalo de confiança pelo desvio-padrão da amostra usada.
  //    Amostra dispersa = intervalo mais largo, mas nunca fora do piso
  //    de 8% nem do teto de 15%.
  const media = selecionados.reduce((s, c) => s + c.valorM2, 0) / selecionados.length;
  const variancia =
    selecionados.reduce((s, c) => s + Math.pow(c.valorM2 - media, 2), 0) /
    selecionados.length;
  const desvioPadrao = Math.sqrt(variancia);
  const coefVariacao = desvioPadrao / media;

  const margem = Math.min(MARGEM_MAXIMA, Math.max(MARGEM_MINIMA, coefVariacao));

  return {
    valorEstimado: Math.round(valorEstimado),
    valorMinimo: Math.round(valorEstimado * (1 - margem)),
    valorMaximo: Math.round(valorEstimado * (1 + margem)),
    valorM2Ponderado: Math.round(valorM2Ponderado),
    margem,
    grauConfianca: classificarConfianca(coefVariacao, selecionados.length),

    // MEMÓRIA DE CÁLCULO — registro auditável (item 3.2 do briefing)
    memoriaCalculo: {
      metodo:
        'Comparação direta de dados de mercado dentro do bairro: descarte do mais caro/mais ' +
        'barato, filtro de ±15% da média do grupo e média ponderada por similaridade do restante',
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
      comparaveisExcluidos: [...descartadosPorSimilaridade, ...extremos, ...foraDaFaixa].map((c) => ({
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
