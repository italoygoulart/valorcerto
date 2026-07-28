/**
 * SIMILARITY ENGINE
 * =================
 * Calcula o quão parecido um comparável é do imóvel avaliando, numa
 * escala de 0 a 1. Cada fator entra com um peso fixo (soma sempre 1,0);
 * o resultado final é a média ponderada dos sub-escores.
 *
 * POR QUE ESSES PESOS
 * --------------------
 * - Distância (35%): localização é o fator dominante na formação de
 *   preço imobiliário — é o fator intrínseco preponderante segundo a
 *   NBR 14.653-2 (item 8.2.1). Continua o maior peso do conjunto.
 * - Área (25%): segundo fator mais forte — imóveis maiores/menores
 *   mudam o preço total de forma quase proporcional.
 * - Padrão construtivo (15%) e idade (10%): efeito sistemático, porém
 *   menor — acabamento e depreciação.
 * - Vagas de garagem (8%): ajuste fino, mas com efeito real e mensurável
 *   (mesma lógica do acréscimo de 4%/vaga usado no motor da estimativa
 *   gratuita — ver FATORES.vagaGaragem em indiceFipeZap.js).
 * - Recência do anúncio (7%): um anúncio antigo tem preço menos
 *   confiável — o mercado pode ter se movido desde a coleta do dado.
 *
 * Os pesos de vagas e recência só diferenciam comparáveis quando o dado
 * de origem realmente varia entre eles — hoje a busca simulada
 * (`buscarComparaveis` em motorComparaveis.js) copia as vagas do próprio
 * avaliando e usa sempre a data corrente, então esses dois pesos ficam
 * "adormecidos" até existir uma fonte real ou comparáveis manuais que
 * variem nessas duas dimensões. Isso é intencional e transparente: o
 * motor já está preparado para usar o dado assim que ele existir, sem
 * fingir que já o usa hoje.
 */
export const PESOS_SIMILARIDADE = {
  distancia: 0.35,
  area: 0.25,
  padrao: 0.15,
  idade: 0.10,
  vagas: 0.08,
  recenciaAnuncio: 0.07,
};

// Escalas ordenadas (do menor para o maior) usadas para medir distância
// relativa entre categorias — ver similaridadeOrdinal() abaixo.
const ESCALA_PADRAO = ['simples', 'medio', 'alto', 'luxo'];
const ESCALA_IDADE = ['novo', 'seminovo', 'usado', 'antigo'];

// Após esse número de dias sem atualização, um anúncio é tratado como
// totalmente desatualizado (similaridade de recência = 0).
const JANELA_RECENCIA_DIAS = 90;

/**
 * Similaridade ordinal: mede a distância relativa entre duas posições
 * numa escala ordenada. Ex.: "simples" para "médio" é mais parecido que
 * "simples" para "luxo" — 1 degrau de diferença contra 3.
 *
 *   similaridade = 1 − |posição(a) − posição(b)| / (tamanho da escala − 1)
 *
 * Substitui a regra binária anterior ("igual = 1, diferente = 0.6"), que
 * tratava "simples vs. luxo" e "simples vs. médio" como igualmente
 * diferentes — o que não reflete como o mercado realmente precifica
 * padrão construtivo e idade (efeito gradual, não um degrau único).
 */
function similaridadeOrdinal(escala, a, b) {
  const ia = escala.indexOf(a);
  const ib = escala.indexOf(b);
  if (ia === -1 || ib === -1) return 0.7; // categoria desconhecida: penalidade neutra, não zera
  return 1 - Math.abs(ia - ib) / (escala.length - 1);
}

/**
 * Similaridade por recência do anúncio: decai linearmente a 0 em
 * JANELA_RECENCIA_DIAS dias — mesma forma de decaimento já usada na
 * distância geográfica (0 km = 1,0 / 5 km = 0), só que no eixo tempo.
 */
function similaridadeRecencia(dataColeta, dataReferencia) {
  if (!dataColeta) return 0.7; // sem data: penalidade neutra, não descarta
  const dias = (dataReferencia - new Date(dataColeta)) / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - dias / JANELA_RECENCIA_DIAS);
}

/**
 * Calcula quão similar um comparável é do avaliando. 0 a 1.
 * @param {Date} [dataReferencia] - data-base para calcular recência do anúncio (default: agora)
 */
export function calcularSimilaridade(avaliando, comp, dataReferencia = new Date()) {
  // Distância: 0 km = 1,0 / 5 km ou mais = 0
  const sDistancia = Math.max(0, 1 - (comp.distanciaKm ?? 0) / 5);

  // Área: penaliza diferença proporcional ao tamanho do avaliando
  const difArea = Math.abs(comp.area - avaliando.area) / avaliando.area;
  const sArea = Math.max(0, 1 - difArea);

  const sPadrao = similaridadeOrdinal(ESCALA_PADRAO, comp.padrao, avaliando.padrao);
  const sIdade = similaridadeOrdinal(ESCALA_IDADE, comp.idade, avaliando.idade);

  // Vagas: decaimento linear numa escala fixa de 3 vagas de diferença = 0
  // (mesma janela usada nas escalas ordinais de padrão/idade). Usar uma
  // escala fixa em vez de proporcional às vagas do avaliando evita que a
  // penalidade já zere na primeira vaga de diferença quando o avaliando
  // tem só 0 ou 1 vaga — o caso mais comum em apartamento.
  const JANELA_VAGAS = 3;
  const vagasAvaliando = avaliando.vagas ?? 0;
  const vagasComp = comp.vagas ?? 0;
  const sVagas = Math.max(0, 1 - Math.abs(vagasComp - vagasAvaliando) / JANELA_VAGAS);

  const sRecencia = similaridadeRecencia(comp.dataColeta, dataReferencia);

  return (
    sDistancia * PESOS_SIMILARIDADE.distancia +
    sArea * PESOS_SIMILARIDADE.area +
    sPadrao * PESOS_SIMILARIDADE.padrao +
    sIdade * PESOS_SIMILARIDADE.idade +
    sVagas * PESOS_SIMILARIDADE.vagas +
    sRecencia * PESOS_SIMILARIDADE.recenciaAnuncio
  );
}
