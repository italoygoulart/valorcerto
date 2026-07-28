/**
 * OUTLIER DETECTOR
 * ================
 * Remove comparáveis cujo preço distorce a amostra, em duas passadas:
 *
 * 1. Descarte dos dois extremos (mais caro e mais barato do grupo) —
 *    aparado fixo, independente de quão dispersa a amostra é.
 * 2. Filtro de faixa: quem ainda ficar fora de ±15% da média do grupo
 *    restante também é removido.
 *
 * Por que duas passadas em vez de um único critério estatístico (ex.:
 * IQR): com amostras pequenas (4-8 comparáveis, típico de bairro único),
 * o IQR fica instável — o próprio cálculo dos quartis já é distorcido
 * pelos poucos pontos disponíveis. O aparado fixo (descartar 1 de cada
 * ponta) é o equivalente de uma "média aparada" (trimmed mean) clássica,
 * robusta justamente para N pequeno. O filtro de ±15% por cima disso é
 * uma segunda rede de segurança, garantindo que a faixa final reflita
 * só comparáveis de fato parecidos entre si em preço.
 */

// Faixa de oscilação aceitável em torno da média do grupo (depois de já
// descartados os dois extremos). Quem ficar fora é excluído também.
export const LIMITE_OSCILACAO_GRUPO = 0.15;

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
