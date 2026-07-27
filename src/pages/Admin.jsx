/** Painel administrativo: leads, métricas e atualização do índice. */
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { formatarBRL } from '../lib/motorFipeZap.js';
import { REGIOES, TIPOS_IMOVEL, DATA_REFERENCIA } from '../data/indiceFipeZap.js';

export default function Admin() {
  const [aba, setAba] = useState('leads');
  const [leads, setLeads] = useState([]);
  const [metricas, setMetricas] = useState(null);
  const [indices, setIndices] = useState([]);
  const [novo, setNovo] = useState({
    dataReferencia: DATA_REFERENCIA, regiao: REGIOES.CENTRAL,
    tipoImovel: 'apartamento', valorM2: '',
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.metricas().then(setMetricas).catch(() => {});
    api.leads().then(setLeads).catch(() => {});
    api.indice().then(setIndices).catch(() => {});
  }, []);

  async function salvarIndice(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api.salvarIndice({ ...novo, valorM2: Number(novo.valorM2) });
      setIndices(await api.indice());
      setMsg('Índice atualizado.');
      setNovo({ ...novo, valorM2: '' });
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="container" style={{ padding: 'var(--e-8) var(--e-6)' }}>
      <h1 style={{ marginBottom: 'var(--e-6)' }}>Administração</h1>

      {metricas && (
        <div className="grid-3" style={{ marginBottom: 'var(--e-8)' }}>
          {[
            ['Leads captados', metricas.leads],
            ['Estimativas gratuitas', metricas.avaliacoesGratuitas],
            ['Avaliações por comparáveis', metricas.avaliacoesComparaveis],
            ['Corretores cadastrados', metricas.corretores],
            ['Assinaturas ativas', metricas.assinaturasAtivas],
          ].map(([label, valor]) => (
            <div key={label} className="cartao" style={{ padding: 'var(--e-4)' }}>
              <div className="numero" style={{ fontSize: 'var(--t-xl)', fontWeight: 500 }}>{valor}</div>
              <div style={{ fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--e-6)', borderBottom: '1px solid var(--linha)', marginBottom: 'var(--e-6)' }}>
        {[['leads', 'Leads'], ['indice', 'Índice FipeZAP']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--e-3) 0',
              fontSize: 'var(--t-sm)', fontWeight: 500, fontFamily: 'var(--fonte-corpo)',
              color: aba === id ? 'var(--tinta)' : 'var(--tinta-suave)',
              borderBottom: aba === id ? '2px solid var(--selo)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'leads' ? (
        leads.length === 0 ? (
          <p style={{ color: 'var(--tinta-suave)' }}>Nenhum lead ainda.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr><th>Data</th><th>Nome</th><th>Contato</th><th>Imóvel</th><th style={{ textAlign: 'right' }}>Estimativa</th></tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.avaliacao_id}>
                  <td className="num">{l.criado_em?.slice(0, 10)}</td>
                  <td>{l.nome}</td>
                  <td style={{ fontSize: 'var(--t-xs)' }}>
                    {l.email}<br />{l.telefone || '—'}
                  </td>
                  <td>{l.imovel_tipo}, {l.area} m²<br /><span style={{ fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)' }}>{l.bairro}</span></td>
                  <td className="num">{formatarBRL(l.valor_minimo)}<br />{formatarBRL(l.valor_maximo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--e-8)', alignItems: 'start' }}>
          <div className="cartao">
            <h3 style={{ marginBottom: 'var(--e-4)', fontSize: 'var(--t-base)' }}>Atualizar índice</h3>
            <form onSubmit={salvarIndice}>
              <div className="campo">
                <label htmlFor="a-ref">Data de referência</label>
                <input id="a-ref" value={novo.dataReferencia} placeholder="2026-07"
                  onChange={(e) => setNovo({ ...novo, dataReferencia: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor="a-regiao">Região</label>
                <select id="a-regiao" value={novo.regiao} onChange={(e) => setNovo({ ...novo, regiao: e.target.value })}>
                  {Object.values(REGIOES).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="a-tipo">Tipo</label>
                <select id="a-tipo" value={novo.tipoImovel} onChange={(e) => setNovo({ ...novo, tipoImovel: e.target.value })}>
                  {TIPOS_IMOVEL.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="a-valor">Valor do m² (R$)</label>
                <input id="a-valor" type="number" required value={novo.valorM2}
                  onChange={(e) => setNovo({ ...novo, valorM2: e.target.value })} />
              </div>
              {msg && <div className="aviso" style={{ marginBottom: 'var(--e-4)' }}>{msg}</div>}
              <button type="submit" className="btn" style={{ width: '100%' }}>Salvar</button>
            </form>

            <div className="aviso" style={{ marginTop: 'var(--e-6)', fontSize: 'var(--t-xs)' }}>
              O índice é atualizado manualmente. Consulte os valores oficiais em
              fipe.org.br antes de salvar.
            </div>
          </div>

          <div>
            <h3 style={{ marginBottom: 'var(--e-4)', fontSize: 'var(--t-base)' }}>Histórico do índice</h3>
            {indices.length === 0 ? (
              <p style={{ color: 'var(--tinta-suave)', fontSize: 'var(--t-sm)' }}>
                Nenhum índice salvo no banco ainda. O sistema está usando os valores
                de exemplo do arquivo de configuração.
              </p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr><th>Referência</th><th>Região</th><th>Tipo</th><th style={{ textAlign: 'right' }}>R$/m²</th><th>Atualizado</th></tr>
                </thead>
                <tbody>
                  {indices.map((i) => (
                    <tr key={i.id}>
                      <td className="num">{i.data_referencia}</td>
                      <td>{i.regiao}</td>
                      <td>{i.tipo_imovel}</td>
                      <td className="num">{formatarBRL(i.valor_m2)}</td>
                      <td className="num" style={{ fontSize: 'var(--t-xs)' }}>{i.atualizado_em?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
