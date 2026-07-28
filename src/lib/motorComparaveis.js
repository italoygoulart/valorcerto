/**
 * MOTOR DE AVALIAÇÃO POR COMPARAÇÃO DE MERCADO
 * ============================================
 * Item 3.2 do briefing técnico. Área paga (corretores CRECI).
 *
 * Orquestra o método comparativo direto de dados de mercado (ABNT NBR
 * 14653), delegando cada responsabilidade a um módulo dedicado:
 *
 *   - avaliacao/similaridade.js  → SimilarityEngine
 *   - avaliacao/outliers.js      → OutlierDetector
 *   - avaliacao/confianca.js     → ConfidenceEngine
 *
 * Este arquivo cuida só da orquestração (buscar candidatos → pontuar →
 * filtrar → calcular → explicar) e da busca de comparáveis em si.
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
import { PESOS_SIMILARIDADE, calcularSimilaridade } from './avaliacao/similaridade.js';
import { descartarExtremos, filtrarForaDaFaixa } from './avaliacao/outliers.js';
import { MARGEM_MINIMA, MARGEM_MAXIMA, classificarConfianca } from './avaliacao/confianca.js';

// Quantos comparáveis (dentre os mais similares) entram na análise antes
// do descarte de extremos. Com 6, o fluxo típico vira: 6 → descarta o
// mais caro e o mais barato → 4 usados na média ponderada.
const QTD_ALVO_COMPARAVEIS = 6;

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

  // 2. Calcular valor por m² e similaridade de cada um (SimilarityEngine)
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

  // 4. Descartar o mais caro e o mais barato do grupo pré-selecionado (OutlierDetector)
  const { mantidos: semExtremos, removidos: extremos } = descartarExtremos(preSelecionados);

  // 5. Do que sobrou, remover quem ainda estiver fora de ±15% da média (OutlierDetector)
  const { mantidos: selecionados, removidos: foraDaFaixa } = filtrarForaDaFaixa(semExtremos);

  if (selecionados.length === 0) {
    throw new Error('Nenhum comparável válido encontrado para este imóvel.');
  }

  // 6. Média ponderada pela similaridade
  const somaPesos = selecionados.reduce((s, c) => s + c.similaridade, 0);
  const valorM2Ponderado =
    selecionados.reduce((s, c) => s + c.valorM2 * c.similaridade, 0) / somaPesos;

  const valorEstimado = valorM2Ponderado * avaliando.area;

  // 7. Intervalo de confiança pelo desvio-padrão da amostra usada
  //    (ConfidenceEngine). Amostra dispersa = intervalo mais largo, mas
  //    nunca fora do piso de 8% nem do teto de 15%.
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
