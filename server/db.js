/**
 * BANCO DE DADOS — SQLite
 * =======================
 * Modelo de dados do item 4 do briefing técnico.
 *
 * SQLite foi escolhido para o MVP: zero configuração, arquivo único,
 * suficiente para o volume inicial. Para produção com muitos assinantes
 * simultâneos, migrar para PostgreSQL — o schema abaixo é compatível.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'avalia.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    -- Proprietários (leads) e corretores (assinantes)
    CREATE TABLE IF NOT EXISTS usuarios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo          TEXT NOT NULL CHECK (tipo IN ('proprietario','corretor','admin')),
      nome          TEXT NOT NULL,
      email         TEXT NOT NULL,
      telefone      TEXT,
      senha_hash    TEXT,              -- só para corretor e admin
      creci         TEXT,              -- só para corretor
      criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

    -- Registro de aceite LGPD. Guardado separado por exigência de auditoria.
    CREATE TABLE IF NOT EXISTS consentimentos_lgpd (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      texto_aceito    TEXT NOT NULL,
      versao          TEXT NOT NULL,
      ip              TEXT,
      aceito_em       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Imóvel submetido para avaliação
    CREATE TABLE IF NOT EXISTS imoveis (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo        TEXT NOT NULL,
      bairro      TEXT NOT NULL,
      area        REAL NOT NULL,
      quartos     INTEGER,
      vagas       INTEGER DEFAULT 0,
      padrao      TEXT,
      idade       TEXT,
      endereco    TEXT,
      criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Cada avaliação realizada
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      imovel_id       INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
      tipo            TEXT NOT NULL CHECK (tipo IN ('gratuita','comparaveis')),
      valor_minimo    INTEGER NOT NULL,
      valor_maximo    INTEGER NOT NULL,
      valor_central   INTEGER NOT NULL,
      data_referencia TEXT,
      criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_avaliacoes_usuario ON avaliacoes(usuario_id);

    -- Memória de cálculo: registro auditável de como o valor foi obtido.
    -- JSON para flexibilidade entre os dois motores.
    CREATE TABLE IF NOT EXISTS memorias_calculo (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      avaliacao_id  INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
      conteudo      TEXT NOT NULL,     -- JSON
      criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Comparáveis usados em cada avaliação (área do corretor)
    CREATE TABLE IF NOT EXISTS comparaveis (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      avaliacao_id  INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
      endereco      TEXT,
      area          REAL,
      valor_anuncio INTEGER,
      valor_m2      INTEGER,
      distancia_km  REAL,
      similaridade  REAL,
      fonte         TEXT,
      url_fonte     TEXT,
      incluido      INTEGER DEFAULT 1,  -- 0 = excluído pelo corretor
      data_coleta   TEXT
    );

    -- Assinaturas dos corretores
    CREATE TABLE IF NOT EXISTS assinaturas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      plano           TEXT NOT NULL CHECK (plano IN ('mensal','anual')),
      status          TEXT NOT NULL CHECK (status IN ('ativa','inadimplente','cancelada')),
      valor_centavos  INTEGER NOT NULL,
      gateway         TEXT,
      gateway_id      TEXT,
      inicio_em       TEXT NOT NULL DEFAULT (datetime('now')),
      proxima_cobranca TEXT
    );

    -- Pedidos de laudo PTAM comprados diretamente pelo proprietário (cliente
    -- final), a partir da estimativa gratuita. O pagamento é do proprietário,
    -- não do corretor — quem cumpre o pedido é um corretor da equipe, que
    -- assume, revisa/coleta os comparáveis e assina o laudo (NBR exige um
    -- responsável técnico com CRECI, então não dá pra ser 100% self-service).
    CREATE TABLE IF NOT EXISTS pedidos_laudo (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      avaliacao_gratuita_id INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
      avaliacao_paga_id   INTEGER REFERENCES avaliacoes(id) ON DELETE SET NULL,
      status              TEXT NOT NULL CHECK (status IN ('pago','em_analise','concluido')) DEFAULT 'pago',
      valor_centavos      INTEGER NOT NULL,
      gateway             TEXT,
      gateway_id          TEXT,
      corretor_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em           TEXT NOT NULL DEFAULT (datetime('now')),
      atribuido_em        TEXT,
      concluido_em        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pedidos_laudo_status ON pedidos_laudo(status);

    -- Créditos de laudo avulso (pagamento por uso, alternativa à assinatura)
    CREATE TABLE IF NOT EXISTS creditos_laudo (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      status          TEXT NOT NULL CHECK (status IN ('disponivel','usado')) DEFAULT 'disponivel',
      valor_centavos  INTEGER NOT NULL,
      gateway         TEXT,
      gateway_id      TEXT,
      avaliacao_id    INTEGER REFERENCES avaliacoes(id) ON DELETE SET NULL,
      criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
      usado_em        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_creditos_usuario ON creditos_laudo(usuario_id, status);

    -- Histórico do índice FipeZAP (atualização manual mensal)
    CREATE TABLE IF NOT EXISTS indices_fipezap (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      data_referencia TEXT NOT NULL,
      regiao          TEXT NOT NULL,
      tipo_imovel     TEXT NOT NULL,
      valor_m2        INTEGER NOT NULL,
      atualizado_por  INTEGER REFERENCES usuarios(id),
      atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_indice_unico
      ON indices_fipezap(data_referencia, regiao, tipo_imovel);

    -- Fotos do imóvel e documentos (matrícula, IPTU etc.) anexados a uma
    -- avaliação. O arquivo em si fica no R2 (bucket privado); aqui só a
    -- referência (chave do objeto), nunca o conteúdo.
    CREATE TABLE IF NOT EXISTS anexos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      avaliacao_id  INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL CHECK (tipo IN ('foto','documento')),
      chave         TEXT NOT NULL,
      nome_original TEXT,
      mime_type     TEXT NOT NULL,
      tamanho_bytes INTEGER NOT NULL,
      criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_anexos_avaliacao ON anexos(avaliacao_id);
  `);

  migrarColunasPtam();

  return db;
}

/**
 * Migração idempotente: adiciona colunas usadas pelo laudo PTAM a bancos
 * já existentes (CREATE TABLE IF NOT EXISTS não altera tabelas criadas
 * antes desta versão do schema).
 */
function migrarColunasPtam() {
  const colunas = [
    ['usuarios', 'cnai', 'TEXT'],
    ['imoveis', 'area_total', 'REAL'],
    ['imoveis', 'matricula', 'TEXT'],
    ['imoveis', 'inscricao_cadastral', 'TEXT'],
    ['imoveis', 'fracao_ideal', 'TEXT'],
    ['imoveis', 'vaga_garagem', 'TEXT'],
    ['imoveis', 'andar', 'TEXT'],
    ['imoveis', 'dormitorios', 'TEXT'],
    ['imoveis', 'estado_conservacao', 'TEXT'],
    ['avaliacoes', 'solicitante_nome', 'TEXT'],
    ['avaliacoes', 'solicitante_cpf', 'TEXT'],
    ['avaliacoes', 'finalidade', 'TEXT'],
    ['avaliacoes', 'objetivo', 'TEXT'],
    ['avaliacoes', 'diagnostico_mercado', 'TEXT'],
    ['avaliacoes', 'grau_fundamentacao', 'TEXT'],
    ['avaliacoes', 'grau_precisao', 'TEXT'],
    ['avaliacoes', 'data_vistoria', 'TEXT'],
  ];
  for (const [tabela, coluna, tipo] of colunas) {
    try {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    } catch (e) {
      if (!/duplicate column/i.test(e.message)) throw e;
    }
  }
}

export default db;
