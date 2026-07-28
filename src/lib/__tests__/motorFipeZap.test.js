import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstimativa, formatarBRL, formatarDataReferencia } from '../motorFipeZap.js';

describe('calcularEstimativa — validação de entrada', () => {
  test('lança erro sem tipo', () => {
    assert.throws(() => calcularEstimativa({ bairro: 'Setor Bueno', area: 80 }));
  });

  test('lança erro sem bairro', () => {
    assert.throws(() => calcularEstimativa({ tipo: 'apartamento', area: 80 }));
  });

  test('lança erro com área zero ou negativa', () => {
    assert.throws(() => calcularEstimativa({ tipo: 'apartamento', bairro: 'Setor Bueno', area: 0 }));
    assert.throws(() => calcularEstimativa({ tipo: 'apartamento', bairro: 'Setor Bueno', area: -10 }));
  });
});

describe('calcularEstimativa — cálculo básico', () => {
  test('retorna faixa com mínimo < central < máximo', () => {
    const r = calcularEstimativa({
      tipo: 'apartamento', bairro: 'Setor Bueno', area: 100, padrao: 'medio', idade: 'seminovo', vagas: 1,
    });
    assert.ok(r.valorMinimo < r.valorCentral);
    assert.ok(r.valorCentral < r.valorMaximo);
  });

  test('padrão mais alto aumenta o valor central em relação ao médio', () => {
    const base = { tipo: 'apartamento', bairro: 'Setor Bueno', area: 100, idade: 'seminovo', vagas: 0 };
    const medio = calcularEstimativa({ ...base, padrao: 'medio' });
    const luxo = calcularEstimativa({ ...base, padrao: 'luxo' });
    assert.ok(luxo.valorCentral > medio.valorCentral);
  });

  test('imóvel mais antigo vale menos que um novo, mantidos os demais fatores', () => {
    const base = { tipo: 'apartamento', bairro: 'Setor Bueno', area: 100, padrao: 'medio', vagas: 0 };
    const novo = calcularEstimativa({ ...base, idade: 'novo' });
    const antigo = calcularEstimativa({ ...base, idade: 'antigo' });
    assert.ok(antigo.valorCentral < novo.valorCentral);
  });

  test('cada vaga de garagem adicional soma valor', () => {
    const base = { tipo: 'apartamento', bairro: 'Setor Bueno', area: 100, padrao: 'medio', idade: 'seminovo' };
    const semVaga = calcularEstimativa({ ...base, vagas: 0 });
    const comVaga = calcularEstimativa({ ...base, vagas: 2 });
    assert.ok(comVaga.valorCentral > semVaga.valorCentral);
  });
});

describe('calcularEstimativa — fallback de região', () => {
  test('bairro não mapeado usa região central e amplia a margem em 50%', () => {
    const r = calcularEstimativa({
      tipo: 'apartamento', bairro: 'Bairro Inexistente XPTO', area: 100, padrao: 'medio', idade: 'seminovo', vagas: 0,
    });
    assert.equal(r.usouFallback, true);
    assert.equal(r.memoriaCalculo.regiao, 'Central');

    const mapeado = calcularEstimativa({
      tipo: 'apartamento', bairro: 'Setor Central', area: 100, padrao: 'medio', idade: 'seminovo', vagas: 0,
    });
    assert.equal(r.margemAplicada, mapeado.margemAplicada * 1.5);
  });
});

describe('calcularEstimativa — terreno', () => {
  test('terreno ignora fatores de padrão e idade', () => {
    const r = calcularEstimativa({
      tipo: 'terreno', bairro: 'Setor Bueno', area: 300, padrao: 'luxo', idade: 'antigo',
    });
    assert.equal(r.memoriaCalculo.fatorPadrao, 1.0);
    assert.equal(r.memoriaCalculo.fatorIdade, 1.0);
  });
});

describe('calcularEstimativa — terreno excedente em casas', () => {
  test('casa com área total maior que a construída soma valor de terreno', () => {
    const r = calcularEstimativa({
      tipo: 'casa', bairro: 'Setor Bueno', area: 150, areaTotal: 400, padrao: 'medio', idade: 'seminovo', vagas: 0,
    });
    assert.ok(r.memoriaCalculo.areaTerrenoExcedente > 0);
    assert.ok(r.memoriaCalculo.valorTerrenoExcedente > 0);
  });

  test('casa sem área total (ou igual à construída) não soma terreno excedente', () => {
    const r = calcularEstimativa({
      tipo: 'casa', bairro: 'Setor Bueno', area: 150, padrao: 'medio', idade: 'seminovo', vagas: 0,
    });
    assert.equal(r.memoriaCalculo.areaTerrenoExcedente, 0);
    assert.equal(r.memoriaCalculo.valorTerrenoExcedente, 0);
  });

  test('apartamento não recebe terreno excedente mesmo informando areaTotal', () => {
    const r = calcularEstimativa({
      tipo: 'apartamento', bairro: 'Setor Bueno', area: 150, areaTotal: 400, padrao: 'medio', idade: 'seminovo', vagas: 0,
    });
    assert.equal(r.memoriaCalculo.areaTerrenoExcedente, 0);
  });
});

describe('formatarBRL / formatarDataReferencia', () => {
  test('formata valor em Real sem casas decimais', () => {
    assert.equal(formatarBRL(1000), 'R$ 1.000');
  });

  test('formata data de referência por extenso', () => {
    assert.equal(formatarDataReferencia('2026-06'), 'junho de 2026');
  });
});
