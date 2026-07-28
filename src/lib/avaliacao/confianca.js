/**
 * CONFIDENCE ENGINE
 * =================
 * Traduz a dispersão de preço da amostra final e o tamanho da amostra
 * num nível de confiança explicável (não é uma probabilidade estatística
 * formal — é uma classificação de leitura rápida para o corretor).
 */

// Faixa mínima e máxima exibida ao usuário/laudo, calculada a partir da
// dispersão real dos comparáveis usados (nunca menor que o piso, nunca
// maior que o teto).
export const MARGEM_MINIMA = 0.08;
export const MARGEM_MAXIMA = 0.15;

/**
 * Classifica a confiança do resultado com base na dispersão (coeficiente
 * de variação = desvio-padrão / média) e no tamanho da amostra usada.
 *
 * Amostra pequena (< 3) é tratada como baixa confiança independente da
 * dispersão — não há base estatística suficiente pra confiar na média,
 * por menor que seja o desvio entre os poucos pontos.
 */
export function classificarConfianca(coefVariacao, qtd) {
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
