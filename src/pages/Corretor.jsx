/** Login e cadastro de corretores. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../lib/api.js';

export default function Corretor({ aoEntrar }) {
  const [modo, setModo] = useState('login');
  const [form, setForm] = useState({ nome: '', email: '', senha: '', creci: '', telefone: '' });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const navegar = useNavigate();

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const r = modo === 'login'
        ? await api.login({ email: form.email, senha: form.senha })
        : await api.cadastro(form);
      setToken(r.token);
      aoEntrar?.();
      navegar('/corretor/painel');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="container-estreito" style={{ padding: 'var(--e-12) var(--e-6)', maxWidth: 460 }}>
      <h1 style={{ marginBottom: 'var(--e-3)' }}>Área do corretor</h1>
      <p style={{ color: 'var(--tinta-suave)', marginBottom: 'var(--e-8)', fontSize: 'var(--t-sm)' }}>
        Avaliação por comparação de mercado para profissionais credenciados.
      </p>

      <form onSubmit={enviar}>
        {modo === 'cadastro' && (
          <>
            <div className="campo">
              <label htmlFor="nome">Nome completo</label>
              <input id="nome" required value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="creci">CRECI</label>
              <input id="creci" required value={form.creci}
                onChange={(e) => setForm({ ...form, creci: e.target.value })}
                placeholder="Somente números" />
            </div>
            <div className="campo">
              <label htmlFor="telefone">Telefone</label>
              <input id="telefone" value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
          </>
        )}

        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" required value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })} />
        </div>

        {erro && <div className="aviso aviso-erro" style={{ marginBottom: 'var(--e-4)' }}>{erro}</div>}

        <button type="submit" className="btn" disabled={carregando} style={{ width: '100%' }}>
          {carregando ? 'Aguarde…' : modo === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>

      <p style={{ marginTop: 'var(--e-6)', fontSize: 'var(--t-sm)', textAlign: 'center' }}>
        {modo === 'login' ? (
          <>Ainda não tem conta? <a href="#" onClick={(e) => { e.preventDefault(); setModo('cadastro'); setErro(''); }}>Cadastre-se</a></>
        ) : (
          <>Já tem conta? <a href="#" onClick={(e) => { e.preventDefault(); setModo('login'); setErro(''); }}>Entrar</a></>
        )}
      </p>

      <div className="aviso" style={{ marginTop: 'var(--e-8)', fontSize: 'var(--t-xs)' }}>
        <strong>Ambiente de teste.</strong> Use corretor@avalia.local / teste123 para
        entrar com assinatura ativa, ou admin@avalia.local / admin123 para o painel
        administrativo.
      </div>
    </div>
  );
}
