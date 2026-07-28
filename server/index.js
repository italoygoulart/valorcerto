/**
 * SERVIDOR DA API
 * ===============
 * Express + SQLite. Rotas públicas (estimativa gratuita) e protegidas
 * (área do corretor e admin).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import db, { initDb } from './db.js';
import {
  uploadAnexo, urlAssinada, baixarAnexo,
  ANEXO_MIME_PERMITIDOS, ANEXO_TAMANHO_MAXIMO, ANEXO_QTD_MAXIMA_POR_AVALIACAO,
} from './storage.js';
import {
  hashSenha, verificarSenha, gerarToken,
  exigirLogin, exigirAssinaturaAtiva, exigirAdmin, validarFormatoCreci,
} from './auth.js';
import { calcularEstimativa } from '../src/lib/motorFipeZap.js';
import { avaliarPorComparaveis } from '../src/lib/motorComparaveis.js';
import { TEXTO_LGPD, VERSAO_LGPD } from '../src/lib/disclaimers.js';
import { VALOR_M2, REGIOES, TIPOS_IMOVEL } from '../src/data/indiceFipeZap.js';

const REGIOES_VALIDAS = new Set(Object.values(REGIOES));
const TIPOS_VALIDOS = new Set(TIPOS_IMOVEL.map((t) => t.id));

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Render/Railway/Fly (destinos de deploy indicados no README) colocam a API
// atrás de um único proxy reverso. Sem isso, req.ip sempre retorna o IP do
// proxy — o que quebra o rate limiting (todo mundo cairia no mesmo balde de
// contagem, um único IP abusivo derrubaria o limite pra todos os usuários)
// e também o IP gravado em consentimentos_lgpd (auditoria LGPD registraria
// o IP do proxy, não o do titular).
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

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

// Rate limiting das rotas públicas sensíveis: login (brute-force de senha),
// cadastro e estimativa (spam de leads / esgotamento da base). As rotas
// autenticadas já exigem token válido, então ficam de fora por ora.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});
const limitadorEstimativa = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Limite de solicitações atingido. Tente novamente mais tarde.' },
});
const limitadorAnexos = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Limite de envio de arquivos atingido. Tente novamente mais tarde.' },
});

// Upload em memória (não grava em disco local) — o buffer vai direto pro R2.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ANEXO_TAMANHO_MAXIMO, files: ANEXO_QTD_MAXIMA_POR_AVALIACAO },
});

/**
 * Valida e envia os arquivos recebidos para o R2, gravando a referência
 * na tabela anexos. Compartilhado entre a rota pública (proprietário) e a
 * autenticada (corretor).
 */
async function salvarAnexos(avaliacaoId, arquivos) {
  const criados = [];
  for (const arquivo of arquivos) {
    const tipo = ANEXO_MIME_PERMITIDOS[arquivo.mimetype];
    if (!tipo) {
      throw new Error(
        `Arquivo "${arquivo.originalname}" tem um formato não permitido. Envie apenas JPG, PNG, WEBP ou PDF.`
      );
    }

    const chave = await uploadAnexo({
      avaliacaoId,
      buffer: arquivo.buffer,
      mimeType: arquivo.mimetype,
      nomeOriginal: arquivo.originalname,
    });

    const r = db
      .prepare(
        `INSERT INTO anexos (avaliacao_id, tipo, chave, nome_original, mime_type, tamanho_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(avaliacaoId, tipo, chave, arquivo.originalname, arquivo.mimetype, arquivo.size);

    criados.push({
      id: r.lastInsertRowid,
      tipo,
      nomeOriginal: arquivo.originalname,
      mimeType: arquivo.mimetype,
      url: await urlAssinada(chave, 3600),
      // Rota própria (mesma origem do app) para reler o conteúdo sem
      // depender de CORS no bucket — usada ao montar o PDF do laudo.
      urlConteudo: `/api/corretor/anexo/${r.lastInsertRowid}/conteudo`,
    });
  }
  return criados;
}

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
app.post('/api/estimativa', limitadorEstimativa, (req, res) => {
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

/**
 * POST /api/estimativa/:id/anexos
 * Upload de fotos do imóvel pelo proprietário, logo após ver a estimativa.
 * Restrito a avaliações do tipo 'gratuita' — não permite anexar em
 * avaliações de corretor por essa rota pública.
 */
app.post(
  '/api/estimativa/:id/anexos',
  limitadorAnexos,
  upload.array('arquivos', ANEXO_QTD_MAXIMA_POR_AVALIACAO),
  async (req, res) => {
    const avaliacao = db
      .prepare(`SELECT id FROM avaliacoes WHERE id = ? AND tipo = 'gratuita'`)
      .get(req.params.id);
    if (!avaliacao) return res.status(404).json({ erro: 'Avaliação não encontrada.' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    const jaTem = db.prepare('SELECT COUNT(*) n FROM anexos WHERE avaliacao_id = ?').get(avaliacao.id).n;
    if (jaTem + req.files.length > ANEXO_QTD_MAXIMA_POR_AVALIACAO) {
      return res
        .status(400)
        .json({ erro: `Máximo de ${ANEXO_QTD_MAXIMA_POR_AVALIACAO} arquivos por avaliação.` });
    }

    try {
      const anexos = await salvarAnexos(avaliacao.id, req.files);
      res.json({ anexos });
    } catch (e) {
      res.status(400).json({ erro: e.message });
    }
  }
);

/* ══════════════════════════════════════════════════════════════════
   AUTENTICAÇÃO
   ══════════════════════════════════════════════════════════════════ */

app.post('/api/auth/cadastro', limitadorLogin, (req, res) => {
  const { nome, email, senha, creci, telefone, cnai } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha nome, e-mail e senha.' });
  }
  if (!validarFormatoCreci(creci)) {
    return res.status(400).json({ erro: 'Informe um número de CRECI válido.' });
  }
  // Filtra por tipo: um proprietário que já pediu estimativa gratuita com
  // esse e-mail (linha sem senha_hash) não pode bloquear o cadastro de
  // corretor — são contas de naturezas diferentes.
  const existe = db
    .prepare(`SELECT id FROM usuarios WHERE email = ? AND tipo IN ('corretor','admin')`)
    .get(email);
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

app.post('/api/auth/login', limitadorLogin, (req, res) => {
  const { email, senha } = req.body;
  // Restrito a corretor/admin: só esses tipos têm senha_hash e podem logar
  // aqui. Sem esse filtro, um proprietário com o mesmo e-mail (sem senha)
  // poderia ser a linha retornada e derrubar o login do corretor de verdade.
  const usuario = db
    .prepare(`SELECT * FROM usuarios WHERE email = ? AND tipo IN ('corretor','admin')`)
    .get(email);

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
        const r = stmt.run(
          avaliacao.lastInsertRowid, c.endereco, c.area, c.valorAnuncio,
          c.valorM2, c.distanciaKm, c.similaridade, c.fonte, c.urlFonte, c.dataColeta
        );
        // Devolvido ao front pra ele conseguir referenciar esse comparável
        // depois, ao preencher a URL da fonte antes de gerar o laudo.
        c.id = r.lastInsertRowid;
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
    dormitorios, estadoConservacao, comparaveisFontes,
  } = req.body;

  // A URL da fonte de cada comparável é obrigatória pra gerar o laudo —
  // sem isso, o PTAM fica sem como o solicitante conferir de onde veio
  // o dado. Validamos aqui de novo (o front já valida) porque a rota é
  // o único ponto de gravação — não dá pra confiar só na tela.
  if (!Array.isArray(comparaveisFontes) || comparaveisFontes.length === 0) {
    return res.status(400).json({ erro: 'Informe a URL da fonte de cada comparável usado.' });
  }
  for (const { id, urlFonte } of comparaveisFontes) {
    if (!id || !urlValida(urlFonte)) {
      return res.status(400).json({
        erro: 'Todas as URLs de fonte precisam ser links válidos (http:// ou https://).',
      });
    }
  }

  const salvar = db.transaction(() => {
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

    // Só atualiza comparáveis que de fato pertencem a essa avaliação —
    // evita que um id forjado no corpo da requisição altere o registro
    // de outro corretor.
    const atualizarFonte = db.prepare(
      `UPDATE comparaveis SET url_fonte = ? WHERE id = ? AND avaliacao_id = ?`
    );
    for (const { id, urlFonte } of comparaveisFontes) {
      atualizarFonte.run(urlFonte, id, avaliacao.id);
    }
  });
  salvar();

  res.json({ ok: true });
});

/**
 * POST /api/corretor/avaliacao/:id/anexos
 * Upload de fotos e documentos (matrícula, IPTU etc.) pelo corretor, para
 * usar no laudo PTAM. Só o dono da avaliação pode anexar.
 */
app.post(
  '/api/corretor/avaliacao/:id/anexos',
  exigirLogin,
  exigirAssinaturaAtiva,
  upload.array('arquivos', ANEXO_QTD_MAXIMA_POR_AVALIACAO),
  async (req, res) => {
    const avaliacao = db
      .prepare('SELECT id FROM avaliacoes WHERE id = ? AND usuario_id = ?')
      .get(req.params.id, req.usuario.id);
    if (!avaliacao) return res.status(404).json({ erro: 'Avaliação não encontrada.' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    const jaTem = db.prepare('SELECT COUNT(*) n FROM anexos WHERE avaliacao_id = ?').get(avaliacao.id).n;
    if (jaTem + req.files.length > ANEXO_QTD_MAXIMA_POR_AVALIACAO) {
      return res
        .status(400)
        .json({ erro: `Máximo de ${ANEXO_QTD_MAXIMA_POR_AVALIACAO} arquivos por avaliação.` });
    }

    try {
      const anexos = await salvarAnexos(avaliacao.id, req.files);
      res.json({ anexos });
    } catch (e) {
      res.status(400).json({ erro: e.message });
    }
  }
);

/**
 * GET /api/corretor/anexo/:id/conteudo
 * Reexibe o conteúdo de um anexo através do próprio servidor (mesma
 * origem do app), para o navegador poder buscar a imagem sem depender de
 * CORS configurado no bucket R2 — usado ao montar o PDF do laudo.
 */
app.get('/api/corretor/anexo/:id/conteudo', exigirLogin, exigirAssinaturaAtiva, async (req, res) => {
  const anexo = db
    .prepare(
      `SELECT a.chave, a.mime_type
       FROM anexos a JOIN avaliacoes av ON av.id = a.avaliacao_id
       WHERE a.id = ? AND av.usuario_id = ?`
    )
    .get(req.params.id, req.usuario.id);
  if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado.' });

  try {
    const { bytes, contentType } = await baixarAnexo(anexo.chave);
    res.setHeader('Content-Type', contentType || anexo.mime_type);
    res.send(Buffer.from(bytes));
  } catch {
    res.status(500).json({ erro: 'Não foi possível carregar o anexo.' });
  }
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

  const ativarAssinatura = db.transaction(() => {
    db.prepare(
      `UPDATE assinaturas SET status='cancelada' WHERE usuario_id=? AND status='ativa'`
    ).run(req.usuario.id);

    db.prepare(
      `INSERT INTO assinaturas (usuario_id, plano, status, valor_centavos, gateway, proxima_cobranca)
       VALUES (?, ?, 'ativa', ?, 'STUB-SEM-COBRANCA', ?)`
    ).run(req.usuario.id, plano, valores[plano], proxima.toISOString().slice(0, 10));
  });
  ativarAssinatura();

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
  if (!REGIOES_VALIDAS.has(regiao)) {
    return res.status(400).json({ erro: 'Região inválida.' });
  }
  if (!TIPOS_VALIDOS.has(tipoImovel)) {
    return res.status(400).json({ erro: 'Tipo de imóvel inválido.' });
  }
  if (!Number.isFinite(Number(valorM2)) || Number(valorM2) <= 0) {
    return res.status(400).json({ erro: 'Valor do m² deve ser um número positivo.' });
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

function urlValida(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
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

// Erros do multer (arquivo grande demais, excesso de arquivos) chegam aqui
// como exceção — sem isso, o cliente recebe um 500 genérico em vez da
// mensagem específica.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const mensagens = {
      LIMIT_FILE_SIZE: `Arquivo muito grande. O limite é ${ANEXO_TAMANHO_MAXIMO / 1024 / 1024}MB por arquivo.`,
      LIMIT_FILE_COUNT: `Você pode enviar no máximo ${ANEXO_QTD_MAXIMA_POR_AVALIACAO} arquivos.`,
      LIMIT_UNEXPECTED_FILE: `Você pode enviar no máximo ${ANEXO_QTD_MAXIMA_POR_AVALIACAO} arquivos.`,
    };
    return res.status(400).json({ erro: mensagens[err.code] || 'Falha no envio do arquivo.' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
