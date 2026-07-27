/**
 * SEED — dados iniciais para teste
 * Cria um admin e um corretor com assinatura ativa.
 */
import db, { initDb } from './db.js';
import { hashSenha } from './auth.js';

initDb();

const jaTem = db.prepare("SELECT id FROM usuarios WHERE tipo='admin'").get();
if (jaTem) {
  console.log('Seed já aplicado.');
  process.exit(0);
}

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

console.log('Seed aplicado:');
console.log('  admin@avalia.local / admin123');
console.log('  corretor@avalia.local / teste123 (assinatura ativa)');
