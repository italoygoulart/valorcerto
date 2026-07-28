import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularSimilaridade } from '../avaliacao/similaridade.js';
import { descartarExtremos, filtrarForaDaFaixa } from '../avaliacao/outliers.js';
import { avaliarPorComparaveis } from '../motorComparaveis.js';

const AVALIANDO = {
  tipo: 'apartamento', bairro: 'Setor Bueno', area: 100, padrao: 'medio', idade: 'seminovo', vagas: 1,
};

function comparavelManual({
  area, valorAnuncio, distanciaKm = 1, padrao = 'medio', idade = 'seminovo', endereco = 'Rua X',
}) {
  return {
    endereco, area, valorAnuncio, distanciaKm, padrao, idade,
    fonte: 'teste', urlFonte: null, dataColeta: '2026-01-01',
  };
}

describe('calcularSimilaridade', () => {
  test('comparável idêntico e colado (0 km) tem similaridade máxima (1.0)', () => {
    const dataReferencia = new Date('2026-06-15');
    const s = calcularSimilaridade(AVALIANDO, {
      area: 100, padrao: 'medio', idade: 'seminovo', distanciaKm: 0,
      vagas: 1, dataColeta: '2026-06-15',
    }, dataReferencia);
    assert.ok(Math.abs(s - 1) < 1e-9);
  });

  test('comparável muito distante e diferente tem similaridade baixa', () => {
    const s = calcularSimilaridade(AVALIANDO, {
      area: 300, padrao: 'luxo', idade: 'antigo', distanciaKm: 10,
    });
    assert.ok(s < 0.3);
  });

  test('similaridade está sempre entre 0 e 1', () => {
    const casos = [
      { area: 1, padrao: 'luxo', idade: 'antigo', distanciaKm: 50 },
      { area: 100, padrao: 'medio', idade: 'seminovo', distanciaKm: 0 },
    ];
    for (const c of casos) {
      const s = calcularSimilaridade(AVALIANDO, c);
      assert.ok(s >= 0 && s <= 1);
    }
  });

  test('padrão: distância ordinal — 1 degrau de diferença pesa menos que 3 degraus', () => {
    const base = { area: 100, idade: 'seminovo', distanciaKm: 0, vagas: 1 };
    const avaliandoSimples = { ...AVALIANDO, padrao: 'simples' };
    const umDegrau = calcularSimilaridade(avaliandoSimples, { ...base, padrao: 'medio' });
    const tresDegraus = calcularSimilaridade(avaliandoSimples, { ...base, padrao: 'luxo' });
    assert.ok(umDegrau > tresDegraus);
  });

  test('idade: distância ordinal — novo vs seminovo é mais parecido que novo vs antigo', () => {
    const base = { area: 100, padrao: 'medio', distanciaKm: 0, vagas: 1 };
    const avaliandoNovo = { ...AVALIANDO, idade: 'novo' };
    const proximo = calcularSimilaridade(avaliandoNovo, { ...base, idade: 'seminovo' });
    const distante = calcularSimilaridade(avaliandoNovo, { ...base, idade: 'antigo' });
    assert.ok(proximo > distante);
  });

  test('vagas: quanto maior a diferença de vagas, menor a similaridade', () => {
    const base = { area: 100, padrao: 'medio', idade: 'seminovo', distanciaKm: 0 };
    // AVALIANDO.vagas = 1
    const mesmaQtd = calcularSimilaridade(AVALIANDO, { ...base, vagas: 1 });
    const umaDiferenca = calcularSimilaridade(AVALIANDO, { ...base, vagas: 0 });
    const duasDiferenca = calcularSimilaridade(AVALIANDO, { ...base, vagas: 3 });
    assert.ok(mesmaQtd > umaDiferenca);
    assert.ok(umaDiferenca > duasDiferenca);
  });

  test('recência: anúncio recente tem similaridade maior que anúncio antigo', () => {
    const base = { area: 100, padrao: 'medio', idade: 'seminovo', distanciaKm: 0, vagas: 1 };
    const dataReferencia = new Date('2026-06-15');
    const recente = calcularSimilaridade(
      AVALIANDO, { ...base, dataColeta: '2026-06-10' }, dataReferencia
    );
    const antigo = calcularSimilaridade(
      AVALIANDO, { ...base, dataColeta: '2026-01-01' }, dataReferencia
    );
    assert.ok(recente > antigo);
  });

  test('recência: anúncio com mais de 90 dias não perde similaridade além do piso do peso', () => {
    const base = { area: 100, padrao: 'medio', idade: 'seminovo', distanciaKm: 0, vagas: 1 };
    const dataReferencia = new Date('2026-06-15');
    const muitoAntigo = calcularSimilaridade(
      AVALIANDO, { ...base, dataColeta: '2025-01-01' }, dataReferencia
    );
    const noLimite = calcularSimilaridade(
      AVALIANDO, { ...base, dataColeta: '2026-03-01' }, dataReferencia
    );
    // Além de ~90 dias, a similaridade de recência já bateu no piso (0);
    // não deve continuar caindo depois disso.
    assert.ok(Math.abs(muitoAntigo - noLimite) < 0.01);
  });
});

describe('descartarExtremos', () => {
  test('com menos de 4 comparáveis, não descarta nada', () => {
    const comps = [{ valorM2: 5000 }, { valorM2: 5200 }, { valorM2: 50000 }];
    const { mantidos, removidos } = descartarExtremos(comps);
    assert.equal(mantidos.length, 3);
    assert.equal(removidos.length, 0);
  });

  test('com 4 ou mais, descarta exatamente o mais caro e o mais barato', () => {
    const comps = [{ valorM2: 5000 }, { valorM2: 8000 }, { valorM2: 5200 }, { valorM2: 3000 }];
    const { mantidos, removidos } = descartarExtremos(comps);
    assert.equal(mantidos.length, 2);
    assert.equal(removidos.length, 2);
    assert.deepEqual(mantidos.map((c) => c.valorM2).sort(), [5000, 5200]);
    assert.deepEqual(removidos.map((c) => c.valorM2).sort((a, b) => a - b), [3000, 8000]);
    for (const r of removidos) {
      assert.match(r.motivoExclusao, /Extremo/);
    }
  });
});

describe('filtrarForaDaFaixa', () => {
  test('mantém todos quando estão dentro de ±15% da média do grupo', () => {
    const comps = [{ valorM2: 5000 }, { valorM2: 5300 }, { valorM2: 5500 }];
    const { mantidos, removidos } = filtrarForaDaFaixa(comps);
    assert.equal(mantidos.length, 3);
    assert.equal(removidos.length, 0);
  });

  test('remove quem ficar fora de ±15% da média do grupo', () => {
    const comps = [{ valorM2: 5000 }, { valorM2: 5100 }, { valorM2: 5200 }, { valorM2: 7000 }];
    const { mantidos, removidos } = filtrarForaDaFaixa(comps);
    assert.equal(removidos.length, 1);
    assert.equal(removidos[0].valorM2, 7000);
    assert.equal(mantidos.length, 3);
    assert.match(removidos[0].motivoExclusao, /±15%/);
  });

  test('array vazio não quebra e retorna vazio', () => {
    const { mantidos, removidos } = filtrarForaDaFaixa([]);
    assert.equal(mantidos.length, 0);
    assert.equal(removidos.length, 0);
  });
});

describe('avaliarPorComparaveis', () => {
  test('calcula valor estimado dentro da faixa mínimo/máximo', async () => {
    const comparaveis = [
      comparavelManual({ area: 95, valorAnuncio: 570000 }),
      comparavelManual({ area: 105, valorAnuncio: 630000 }),
      comparavelManual({ area: 100, valorAnuncio: 600000 }),
      comparavelManual({ area: 98, valorAnuncio: 588000 }),
    ];
    const r = await avaliarPorComparaveis(AVALIANDO, comparaveis);
    assert.ok(r.valorMinimo <= r.valorEstimado);
    assert.ok(r.valorEstimado <= r.valorMaximo);
    assert.equal(r.memoriaCalculo.qtdCandidatos, 4);
  });

  test('com 6 comparáveis, descarta o mais caro e o mais barato e usa os 4 restantes', async () => {
    const comparaveis = [
      comparavelManual({ area: 100, valorAnuncio: 600000 }), // valorM2 6000 (mediano)
      comparavelManual({ area: 100, valorAnuncio: 600000 }),
      comparavelManual({ area: 100, valorAnuncio: 600000 }),
      comparavelManual({ area: 100, valorAnuncio: 600000 }),
      comparavelManual({ area: 100, valorAnuncio: 500000 }), // mais barato
      comparavelManual({ area: 100, valorAnuncio: 700000 }), // mais caro
    ];
    const r = await avaliarPorComparaveis(AVALIANDO, comparaveis);
    assert.equal(r.memoriaCalculo.qtdSelecionados, 4);
    assert.equal(r.memoriaCalculo.comparaveisExcluidos.length, 2);
    assert.ok(r.memoriaCalculo.comparaveisExcluidos.some((c) => c.valorM2 === 5000));
    assert.ok(r.memoriaCalculo.comparaveisExcluidos.some((c) => c.valorM2 === 7000));
    assert.equal(r.valorEstimado, 600000); // só sobram os 4 de 6000 R$/m² × 100 m²
  });

  test('com mais de 6 comparáveis, só os 6 mais similares entram na análise', async () => {
    const similares = Array.from({ length: 6 }, (_, i) =>
      comparavelManual({ area: 100, valorAnuncio: 600000, distanciaKm: 0.5, endereco: `Similar ${i}` }));
    const distantes = [
      comparavelManual({ area: 100, valorAnuncio: 600000, distanciaKm: 4.9, padrao: 'luxo', idade: 'antigo', endereco: 'Distante 1' }),
      comparavelManual({ area: 100, valorAnuncio: 600000, distanciaKm: 4.9, padrao: 'luxo', idade: 'antigo', endereco: 'Distante 2' }),
    ];
    const r = await avaliarPorComparaveis(AVALIANDO, [...similares, ...distantes]);
    assert.equal(r.memoriaCalculo.qtdCandidatos, 8);
    assert.ok(
      r.memoriaCalculo.comparaveisExcluidos.some((c) => /mais similares/.test(c.motivo))
    );
  });

  test('lança erro quando não há comparáveis manuais', async () => {
    await assert.rejects(() => avaliarPorComparaveis(AVALIANDO, []));
  });

  test('lança erro quando todos os comparáveis ficam fora da faixa de ±15% entre si', async () => {
    const comparaveis = [
      comparavelManual({ area: 100, valorAnuncio: 400000 }), // valorM2 4000
      comparavelManual({ area: 100, valorAnuncio: 800000 }), // valorM2 8000 — dispersão grande demais
    ];
    await assert.rejects(() => avaliarPorComparaveis(AVALIANDO, comparaveis));
  });

  test('margem mínima de 8% mesmo com comparáveis idênticos', async () => {
    const comparaveis = [
      comparavelManual({ area: 100, valorAnuncio: 600000 }),
      comparavelManual({ area: 100, valorAnuncio: 600000 }),
      comparavelManual({ area: 100, valorAnuncio: 600000 }),
    ];
    const r = await avaliarPorComparaveis(AVALIANDO, comparaveis);
    assert.equal(r.margem, 0.08);
  });

  test('dispersão moderada resulta em margem entre o piso (8%) e o teto (15%)', async () => {
    const comparaveis = [
      comparavelManual({ area: 100, valorAnuncio: 500000 }), // 5000
      comparavelManual({ area: 100, valorAnuncio: 570000 }), // 5700
      comparavelManual({ area: 100, valorAnuncio: 650000 }), // 6500
    ];
    const r = await avaliarPorComparaveis(AVALIANDO, comparaveis);
    assert.ok(r.margem > 0.08);
    assert.ok(r.margem <= 0.15);
    assert.equal(r.grauConfianca.nivel, 'medio');
  });

  test('a margem nunca ultrapassa o teto de 15%, mesmo com muitos comparáveis dispersos', async () => {
    const comparaveis = [
      comparavelManual({ area: 100, valorAnuncio: 520000 }),
      comparavelManual({ area: 100, valorAnuncio: 480000 }),
      comparavelManual({ area: 100, valorAnuncio: 560000 }),
      comparavelManual({ area: 100, valorAnuncio: 440000 }),
      comparavelManual({ area: 100, valorAnuncio: 900000 }), // extremo — será descartado
      comparavelManual({ area: 100, valorAnuncio: 100000 }), // extremo — será descartado
    ];
    const r = await avaliarPorComparaveis(AVALIANDO, comparaveis);
    assert.ok(r.margem <= 0.15);
  });
});
