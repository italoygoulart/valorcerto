/**
 * SERVIDOR DA API
 * ===============
 * Express + SQLite. Rotas públicas (estimativa gratuita) e protegidas
 * (área do corretor e admin).
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import db, { initDb } from './db.js';
import {
  hashSenha, verificarSenha, gerarToken,
  exigirLogin, exigirAssinaturaAtiva, exigirAdmin, validarFormatoCreci,
} from './auth.js';
import { calcularEstimativa } from '../src/lib/motorFipeZap.js';
import { avaliarPorComparaveis } from '../src/lib/motorComparaveis.js';
import { TEXTO_LGPD, VERSAO_LGPD } from '../src/lib/disclaimers.js';
import { VALOR_M2 } from '../src/data/indiceFipeZap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
// Em produção (Render etc.) o host injeta PORT e a API precisa escutar
// nela. Em desenvolvimento, o Vite roda em paralelo e algumas ferramentas
// também injetam PORT (para o Vite) — por isso, fora de produção, usamos
// API_PORT (ou 3001) e ignoramos PORT para não colidir com o Vite.
const PORT =
  process.env.API_PORT ||
  (process.env.NODE_ENV === 'production' ? process.env.PORT : null) ||
  3001;

app.use(cors());
app.use(express.json());

initDb();
seedDemoSeNecessario();

/* ══════════════════════════════════════════════════════════════════
   ROTAS PÚBLICAS — Estimativa gratuita (proprietário)
   ══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/estimativa
 * Calcula a estimativa gratuita E registra o lead com consentimento LGPD.
 * As duas coisas na mesma transação: sem consentimento, não há estimativa.
 */
app.post('/api/estimativa', (req, res) => {
  const { imovel, contato, aceiteLgpd } = req.body;

  if (!aceiteLgpd) {
    return res.status(400).json({
      erro: 'É necessário aceitar os termos de uso dos dados para continuar.',
    });
  }
  if (!contato?.nome || !contato?.email) {
    return res.status(400).json({ erro: 'Informe nome e e-mail.' });
  }

  let estimativa;
  try {
    estimativa = calcularEstimativa(imovel);
  } catch (e) {
    return res.status(400).json({ erro: e.message });
  }

  const transacao = db.transaction(() => {
    const usuario = db
      .prepare(
        `INSERT INTO usuarios (tipo, nome, email, telefone)
         VALUES ('proprietario', ?, ?, ?)`
      )
      .run(contato.nome, contato.email, contato.telefone || null);

    db.prepare(
      `INSERT INTO consentimentos_lgpd (usuario_id, texto_aceito, versao, ip)
       VALUES (?, ?, ?, ?)`
    ).run(usuario.lastInsertRowid, TEXTO_LGPD, VERSAO_LGPD, req.ip);

    const imovelRow = db
      .prepare(
        `INSERT INTO imoveis (tipo, bairro, area, area_total, quartos, vagas, padrao, idade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        imovel.tipo, imovel.bairro, imovel.area, imovel.areaTotal || null,
        imovel.quartos || null, imovel.vagas || 0,
        imovel.padrao || null, imovel.idade || null
      );

    const avaliacao = db
      .prepare(
        `INSERT INTO avaliacoes
         (usuario_id, imovel_id, tipo, valor_minimo, valor_maximo, valor_central, data_referencia)
         VALUES (?, ?, 'gratuita', ?, ?, ?, ?)`
      )
      .run(
        usuario.lastInsertRowid, imovelRow.lastInsertRowid,
        estimativa.valorMinimo, estimativa.valorMaximo,
        estimativa.valorCentral, estimativa.dataReferencia
      );

    db.prepare(
      `INSERT INTO memorias_calculo (avaliacao_id, conteudo) VALUES (?, ?)`
    ).run(avaliacao.lastInsertRowid, JSON.stringify(estimativa.memoriaCalculo));

    return avaliacao.lastInsertRowid;
  });

  const avaliacaoId = transacao();

  // TODO INTEGRAÇÃO: notificar o corretor do novo lead (e-mail/WhatsApp).
  // Ver item 2.1 do briefing.

  res.json({ ...estimativa, avaliacaoId });
});

/* ══════════════════════════════════════════════════════════════════
   AUTENTICAÇÃO
   ══════════════════════════════════════════════════════════════════ */

app.post('/api/auth/cadastro', (req, res) => {
  const { nome, email, senha, creci, telefone, cnai } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha nome, e-mail e senha.' });
  }
  if (!validarFormatoCreci(creci)) {
    return res.status(400).json({ erro: 'Informe um número de CRECI válido.' });
  }
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) {
    return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
  }

  const r = db
    .prepare(
      `INSERT INTO usuarios (tipo, nome, email, telefone, senha_hash, creci, cnai)
       VALUES ('corretor', ?, ?, ?, ?, ?, ?)`
    )
    .run(nome, email, telefone || null, hashSenha(senha), creci, cnai || null);

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(r.lastInsertRowid);
  res.json({ token: gerarToken(usuario), usuario: publicoUsuario(usuario) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);

  if (!usuario || !usuario.senha_hash || !verificarSenha(senha, usuario.senha_hash)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }

  const assinatura = db
    .prepare(`SELECT * FROM assinaturas WHERE usuario_id = ? AND status='ativa' ORDER BY id DESC LIMIT 1`)
    .get(usuario.id);

  res.json({
    token: gerarToken(usuario),
    usuario: publicoUsuario(usuario),
    assinaturaAtiva: !!assinatura || usuario.tipo === 'admin',
  });
});

app.get('/api/auth/eu', exigirLogin, (req, res) => {
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  const assinatura = db
    .prepare(`SELECT * FROM assinaturas WHERE usuario_id = ? AND status='ativa' ORDER BY id DESC LIMIT 1`)
    .get(usuario.id);
  res.json({
    usuario: publicoUsuario(usuario),
    assinaturaAtiva: !!assinatura || usuario.tipo === 'admin',
    assinatura: assinatura || null,
  });
});

/* ══════════════════════════════════════════════════════════════════
   ÁREA DO CORRETOR — exige login + assinatura ativa
   ══════════════════════════════════════════════════════════════════ */

app.post('/api/corretor/avaliar', exigirLogin, exigirAssinaturaAtiva, async (req, res) => {
  const { imovel, comparaveisManuais } = req.body;

  try {
    // Estimativa do m² pelo motor gratuito, usada como âncora da busca
    const regiaoValores = VALOR_M2;
    const base = calcularEstimativa(imovel);
    const valorM2Estimado = base.memoriaCalculo.valorM2Base;

    const resultado = await avaliarPorComparaveis(
      { ...imovel, valorM2Estimado },
      comparaveisManuais
    );

    const salvar = db.transaction(() => {
      const imovelRow = db
        .prepare(
          `INSERT INTO imoveis
           (tipo, bairro, area, area_total, quartos, vagas, padrao, idade, endereco,
            matricula, inscricao_cadastral, fracao_ideal, vaga_garagem, andar,
            dormitorios, estado_conservacao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          imovel.tipo, imovel.bairro, imovel.area, imovel.areaTotal || null,
          imovel.quartos || null,
          imovel.vagas || 0, imovel.padrao || null, imovel.idade || null,
          imovel.endereco || null,
          imovel.matricula || null, imovel.inscricaoCadastral || null,
          imovel.fracaoIdeal || null, imovel.vagaGaragem || null, imovel.andar || null,
          imovel.dormitorios || null, imovel.estadoConservacao || null
        );

      const avaliacao = db
        .prepare(
          `INSERT INTO avaliacoes
           (usuario_id, imovel_id, tipo, valor_minimo, valor_maximo, valor_central)
           VALUES (?, ?, 'comparaveis', ?, ?, ?)`
        )
        .run(
          req.usuario.id, imovelRow.lastInsertRowid,
          resultado.valorMinimo, resultado.valorMaximo, resultado.valorEstimado
        );

      db.prepare(
        `INSERT INTO memorias_calculo (avaliacao_id, conteudo) VALUES (?, ?)`
      ).run(avaliacao.lastInsertRowid, JSON.stringify(resultado.memoriaCalculo));

      const stmt = db.prepare(
        `INSERT INTO comparaveis
         (avaliacao_id, endereco, area, valor_anuncio, valor_m2, distancia_km,
          similaridade, fonte, url_fonte, incluido, data_coleta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      );
      for (const c of resultado.memoriaCalculo.comparaveisUsados) {
        stmt.run(
          avaliacao.lastInsertRowid, c.endereco, c.area, c.valorAnuncio,
          c.valorM2, c.distanciaKm, c.similaridade, c.fonte, c.urlFonte, c.dataColeta
        );
      }

      return avaliacao.lastInsertRowid;
    });

    const avaliacaoId = salvar();
    res.json({ ...resultado, avaliacaoId });
  } catch (e) {
    res.status(400).json({ erro: e.message });
  }
});

app.get('/api/corretor/historico', exigirLogin, exigirAssinaturaAtiva, (req, res) => {
  const linhas = db
    .prepare(
      `SELECT a.id, a.tipo, a.valor_minimo, a.valor_maximo, a.valor_central, a.criado_em,
              i.tipo AS imovel_tipo, i.bairro, i.area, i.endereco
       FROM avaliacoes a
       JOIN imoveis i ON i.id = a.imovel_id
       WHERE a.usuario_id = ?
       ORDER BY a.id DESC LIMIT 100`
    )
    .all(req.usuario.id);
  res.json(linhas);
});

app.get('/api/corretor/avaliacao/:id', exigirLogin, exigirAssinaturaAtiva, (req, res) => {
  const avaliacao = db
    .prepare(
      `SELECT a.*, i.tipo AS imovel_tipo, i.bairro, i.area, i.endereco, i.padrao, i.idade, i.vagas,
              i.area_total, i.matricula, i.inscricao_cadastral, i.fracao_ideal, i.vaga_garagem, i.andar,
              i.dormitorios, i.estado_conservacao
       FROM avaliacoes a JOIN imoveis i ON i.id = a.imovel_id
       WHERE a.id = ? AND a.usuario_id = ?`
    )
    .get(req.params.id, req.usuario.id);

  if (!avaliacao) return res.status(404).json({ erro: 'Avaliação não encontrada.' });

  const memoria = db
    .prepare('SELECT conteudo FROM memorias_calculo WHERE avaliacao_id = ?')
    .get(req.params.id);
  const comps = db
    .prepare('SELECT * FROM comparaveis WHERE avaliacao_id = ?')
    .all(req.params.id);

  res.json({
    ...avaliacao,
    memoriaCalculo: memoria ? JSON.parse(memoria.conteudo) : null,
    comparaveis: comps,
  });
});

/**
 * PUT /api/corretor/avaliacao/:id/laudo
 * Grava os dados exigidos pelo Parecer Técnico de Avaliação Mercadológica
 * (PTAM, NBR 14653) que não fazem parte do cálculo rápido: identificação
 * do solicitante, dados registrais do imóvel e enquadramento técnico.
 */
app.put('/api/corretor/avaliacao/:id/laudo', exigirLogin, exigirAssinaturaAtiva, (req, res) => {
  const avaliacao = db
    .prepare('SELECT a.id, a.imovel_id FROM avaliacoes a WHERE a.id = ? AND a.usuario_id = ?')
    .get(req.params.id, req.usuario.id);
  if (!avaliacao) return res.status(404).json({ erro: 'Avaliação não encontrada.' });

  const {
    solicitanteNome, solicitanteCpf, finalidade, objetivo, diagnosticoMercado,
    grauFundamentacao, grauPrecisao, dataVistoria,
    matricula, inscricaoCadastral, fracaoIdeal, vagaGaragem, andar,
    dormitorios, estadoConservacao,
  } = req.body;

  db.prepare(
    `UPDATE avaliacoes SET
       solicitante_nome = ?, solicitante_cpf = ?, finalidade = ?, objetivo = ?,
       diagnostico_mercado = ?, grau_fundamentacao = ?, grau_precisao = ?, data_vistoria = ?
     WHERE id = ?`
  ).run(
    solicitanteNome || null, solicitanteCpf || null, finalidade || null, objetivo || null,
    diagnosticoMercado || null, grauFundamentacao || null, grauPrecisao || null,
    dataVistoria || null, avaliacao.id
  );

  db.prepare(
    `UPDATE imoveis SET
       matricula = ?, inscricao_cadastral = ?, fracao_ideal = ?, vaga_garagem = ?,
       andar = ?, dormitorios = ?, estado_conservacao = ?
     WHERE id = ?`
  ).run(
    matricula || null, inscricaoCadastral || null, fracaoIdeal || null,
    vagaGaragem || null, andar || null, dormitorios || null, estadoConservacao || null,
    avaliacao.imovel_id
  );

  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════
   ASSINATURA
   ══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/assinatura/criar
 *
 * ─────────────────────────────────────────────────────────────────
 * ATENÇÃO DESENVOLVEDOR — INTEGRAÇÃO DE PAGAMENTO PENDENTE
 *
 * Esta rota ATIVA A ASSINATURA SEM COBRAR. É um stub para permitir
 * testar o fluxo completo do app.
 *
 * Em produção, substituir por: criar cobrança no gateway → aguardar
 * confirmação via webhook → só então gravar status 'ativa'.
 * Gateway precisa suportar Pix. Ver item 5 do briefing.
 * ─────────────────────────────────────────────────────────────────
 */
app.post('/api/assinatura/criar', exigirLogin, (req, res) => {
  const { plano } = req.body;
  if (!['mensal', 'anual'].includes(plano)) {
    return res.status(400).json({ erro: 'Escolha o plano mensal ou anual.' });
  }

  const valores = { mensal: 8900, anual: 82800 }; // centavos
  const proxima = new Date();
  if (plano === 'mensal') proxima.setMonth(proxima.getMonth() + 1);
  else proxima.setFullYear(proxima.getFullYear() + 1);

  db.prepare(
    `UPDATE assinaturas SET status='cancelada' WHERE usuario_id=? AND status='ativa'`
  ).run(req.usuario.id);

  db.prepare(
    `INSERT INTO assinaturas (usuario_id, plano, status, valor_centavos, gateway, proxima_cobranca)
     VALUES (?, ?, 'ativa', ?, 'STUB-SEM-COBRANCA', ?)`
  ).run(req.usuario.id, plano, valores[plano], proxima.toISOString().slice(0, 10));

  res.json({ ok: true, plano, aviso: 'Assinatura ativada sem cobrança (ambiente de teste).' });
});

/* ══════════════════════════════════════════════════════════════════
   ADMIN — leads e índice
   ══════════════════════════════════════════════════════════════════ */

app.get('/api/admin/leads', exigirLogin, exigirAdmin, (req, res) => {
  const leads = db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.telefone, u.criado_em,
              i.tipo AS imovel_tipo, i.bairro, i.area,
              a.valor_minimo, a.valor_maximo, a.id AS avaliacao_id
       FROM usuarios u
       JOIN avaliacoes a ON a.usuario_id = u.id
       JOIN imoveis i ON i.id = a.imovel_id
       WHERE u.tipo = 'proprietario'
       ORDER BY u.id DESC LIMIT 200`
    )
    .all();
  res.json(leads);
});

app.get('/api/admin/metricas', exigirLogin, exigirAdmin, (req, res) => {
  const q = (sql) => db.prepare(sql).get().n;
  res.json({
    leads: q(`SELECT COUNT(*) n FROM usuarios WHERE tipo='proprietario'`),
    avaliacoesGratuitas: q(`SELECT COUNT(*) n FROM avaliacoes WHERE tipo='gratuita'`),
    avaliacoesComparaveis: q(`SELECT COUNT(*) n FROM avaliacoes WHERE tipo='comparaveis'`),
    corretores: q(`SELECT COUNT(*) n FROM usuarios WHERE tipo='corretor'`),
    assinaturasAtivas: q(`SELECT COUNT(*) n FROM assinaturas WHERE status='ativa'`),
  });
});

app.get('/api/admin/indice', exigirLogin, exigirAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM indices_fipezap ORDER BY data_referencia DESC').all());
});

app.post('/api/admin/indice', exigirLogin, exigirAdmin, (req, res) => {
  const { dataReferencia, regiao, tipoImovel, valorM2 } = req.body;
  if (!dataReferencia || !regiao || !tipoImovel || !valorM2) {
    return res.status(400).json({ erro: 'Preencha todos os campos do índice.' });
  }
  db.prepare(
    `INSERT INTO indices_fipezap (data_referencia, regiao, tipo_imovel, valor_m2, atualizado_por)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(data_referencia, regiao, tipo_imovel)
     DO UPDATE SET valor_m2 = excluded.valor_m2, atualizado_em = datetime('now')`
  ).run(dataReferencia, regiao, tipoImovel, valorM2, req.usuario.id);
  res.json({ ok: true });
});

/* LGPD: exclusão de dados a pedido do titular (item 6.3 do briefing) */
app.delete('/api/admin/lead/:id', exigirLogin, exigirAdmin, (req, res) => {
  db.prepare('DELETE FROM usuarios WHERE id = ? AND tipo = ?').run(req.params.id, 'proprietario');
  res.json({ ok: true });
});

function publicoUsuario(u) {
  return { id: u.id, nome: u.nome, email: u.email, tipo: u.tipo, creci: u.creci, cnai: u.cnai };
}

/**
 * Recria os usuários de demonstração se o banco estiver vazio.
 *
 * Necessário porque hospedagens gratuitas (ex.: Render free) usam disco
 * efêmero: a cada novo deploy ou reinício após período ocioso, o arquivo
 * SQLite pode voltar ao estado inicial. Sem isso, o login de demonstração
 * quebraria depois do primeiro "sono" do serviço.
 */
function seedDemoSeNecessario() {
  const jaTem = db.prepare("SELECT id FROM usuarios WHERE tipo='admin'").get();
  if (jaTem) return;

  const admin = db.prepare(
    `INSERT INTO usuarios (tipo, nome, email, senha_hash, creci, cnai)
     VALUES ('admin', 'Italo Goulart', 'admin@avalia.local', ?, '37644', '44010')`
  ).run(hashSenha('admin123'));

  const corretor = db.prepare(
    `INSERT INTO usuarios (tipo, nome, email, senha_hash, creci)
     VALUES ('corretor', 'Corretor Teste', 'corretor@avalia.local', ?, '12345')`
  ).run(hashSenha('teste123'));

  db.prepare(
    `INSERT INTO assinaturas (usuario_id, plano, status, valor_centavos, gateway, proxima_cobranca)
     VALUES (?, 'mensal', 'ativa', 8900, 'SEED', date('now','+1 month'))`
  ).run(corretor.lastInsertRowid);

  console.log('Usuários de demonstração recriados (admin@avalia.local / corretor@avalia.local).');
}

// Serve o build do frontend (npm run build) quando ele existir, para que
// API e site rodem no mesmo processo/porta — necessário nos planos free
// de hospedagem, que só permitem um serviço web.
const distDir = join(__dirname, '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
