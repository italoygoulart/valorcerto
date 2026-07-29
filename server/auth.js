/**
 * AUTENTICAÇÃO — Corretores e admin
 * =================================
 * JWT simples. Gate de acesso à área paga: só passa corretor com
 * assinatura ATIVA (item 2.2 do briefing).
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';

// ATENÇÃO DEPLOY: definir JWT_SECRET nas variáveis de ambiente.
// Em produção, subir sem essa variável é um risco de segurança grave (o
// fallback abaixo é público, qualquer um poderia forjar um token de admin),
// então falhamos o boot em vez de degradar silenciosamente.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET não definido em produção. Configure a variável de ambiente antes de iniciar o servidor.'
  );
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar-em-producao';
const EXPIRACAO = '7d';

export function hashSenha(senha) {
  return bcrypt.hashSync(senha, 10);
}

export function verificarSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}

export function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, tipo: usuario.tipo, nome: usuario.nome },
    JWT_SECRET,
    { expiresIn: EXPIRACAO }
  );
}

/** Middleware: exige usuário autenticado. */
export function exigirLogin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Faça login para continuar.' });
  }

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
}

/**
 * Consulta o acesso pago do usuário: assinatura ativa e/ou créditos de
 * laudo avulso ainda não usados. Os dois modelos convivem — quem assina
 * tem uso ilimitado; quem não assina pode comprar créditos por laudo.
 */
export function obterAcesso(usuarioId) {
  const assinatura = db
    .prepare(
      `SELECT * FROM assinaturas
       WHERE usuario_id = ? AND status = 'ativa'
       ORDER BY id DESC LIMIT 1`
    )
    .get(usuarioId);

  const creditosDisponiveis = db
    .prepare(`SELECT COUNT(*) n FROM creditos_laudo WHERE usuario_id = ? AND status = 'disponivel'`)
    .get(usuarioId).n;

  return { assinatura: assinatura || null, creditosDisponiveis };
}

/**
 * Middleware: exige acesso pago à área do corretor — assinatura ativa OU
 * ao menos um crédito de laudo avulso disponível. Este é o gate comercial
 * da aba de corretores. O crédito em si só é consumido na emissão do laudo
 * (rota .../laudo), não aqui — entrar na área e buscar comparáveis não gasta
 * o crédito.
 */
export function exigirAcesso(req, res, next) {
  if (req.usuario.tipo === 'admin') return next(); // admin sempre passa

  const acesso = obterAcesso(req.usuario.id);
  if (!acesso.assinatura && acesso.creditosDisponiveis === 0) {
    return res.status(403).json({
      erro: 'Sua assinatura não está ativa e você não tem créditos de laudo avulso disponíveis.',
      acao: 'assinar',
    });
  }

  req.assinatura = acesso.assinatura;
  req.creditosDisponiveis = acesso.creditosDisponiveis;
  next();
}

/** Middleware: exige perfil admin. */
export function exigirAdmin(req, res, next) {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  next();
}

/**
 * Validação de CRECI.
 * MVP: valida apenas o formato. Em produção, considerar consulta ao
 * cadastro do COFECI/CRECI-GO para validação real.
 */
export function validarFormatoCreci(creci) {
  if (!creci) return false;
  const limpo = String(creci).replace(/\D/g, '');
  return limpo.length >= 4 && limpo.length <= 7;
}
