/**
 * PÁGINA PÚBLICA — Estimativa gratuita
 * Item 2.1 do briefing. Formulário curto, resultado em faixa, captura
 * de lead com aceite LGPD e upsell do laudo.
 */
import { useState } from 'react';
import { api } from '../lib/api.js';
import { formatarBRL, formatarDataReferencia } from '../lib/motorFipeZap.js';
import { DISCLAIMER_ESTIMATIVA, TEXTO_LGPD, AVISO_FALLBACK } from '../lib/disclaimers.js';
import { LISTA_BAIRROS, TIPOS_IMOVEL, PADROES, IDADES, rotuloArea } from '../data/indiceFipeZap.js';

const INICIAL = {
  tipo: 'apartamento', bairro: '', area: '', areaTotal: '', quartos: '', vagas: '0',
  padrao: 'medio', idade: 'seminovo',
};

export default function Estimativa() {
  const [imovel, setImovel] = useState(INICIAL);
  const [contato, setContato] = useState({ nome: '', email: '', telefone: '' });
  const [aceite, setAceite] = useState(false);
  const [etapa, setEtapa] = useState('imovel'); // imovel | contato | resultado
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const ehTerreno = imovel.tipo === 'terreno';
  const ehCasa = imovel.tipo === 'casa';

  function mudarImovel(campo, valor) {
    setImovel((p) => ({ ...p, [campo]: valor }));
  }

  function irParaContato(e) {
    e.preventDefault();
    if (!imovel.bairro || !imovel.area) {
      setErro('Informe o bairro e a área do imóvel.');
      return;
    }
    setErro('');
    setEtapa('contato');
  }

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    if (!aceite) {
      setErro('É preciso aceitar os termos para receber a estimativa.');
      return;
    }
    setCarregando(true);
    try {
      const r = await api.estimativa({
        imovel: {
          ...imovel,
          area: Number(imovel.area),
          areaTotal: Number(imovel.areaTotal) || null,
          quartos: Number(imovel.quartos) || null,
          vagas: Number(imovel.vagas) || 0,
        },
        contato,
        aceiteLgpd: true,
      });
      setResultado(r);
      setEtapa('resultado');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  function recomecar() {
    setImovel(INICIAL);
    setContato({ nome: '', email: '', telefone: '' });
    setAceite(false);
    setResultado(null);
    setEtapa('imovel');
  }

  /* ── Resultado ─────────────────────────────────────── */
  if (etapa === 'resultado' && resultado) {
    return (
      <div className="container-estreito" style={{ padding: 'var(--e-12) var(--e-6)' }}>
        <p style={{ fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tinta-suave)', marginBottom: 'var(--e-2)' }}>
          Estimativa referencial
        </p>
        <h1 style={{ marginBottom: 'var(--e-6)' }}>Seu imóvel vale entre</h1>

        <div className="cartao" style={{ textAlign: 'center', padding: 'var(--e-8)' }}>
          <div className="numero" style={{ fontSize: 'var(--t-2xl)', fontWeight: 500, lineHeight: 1.2 }}>
            {formatarBRL(resultado.valorMinimo)}
          </div>
          <div style={{ color: 'var(--tinta-suave)', margin: 'var(--e-2) 0', fontSize: 'var(--t-sm)' }}>e</div>
          <div className="numero" style={{ fontSize: 'var(--t-2xl)', fontWeight: 500, lineHeight: 1.2 }}>
            {formatarBRL(resultado.valorMaximo)}
          </div>
          <p style={{ marginTop: 'var(--e-4)', fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)' }}>
            Índice de referência: {formatarDataReferencia(resultado.dataReferencia)} ·
            margem de ±{Math.round(resultado.margemAplicada * 100)}%
          </p>
        </div>

        {resultado.usouFallback && (
          <div className="aviso" style={{ marginTop: 'var(--e-4)' }}>{AVISO_FALLBACK}</div>
        )}

        {/* Memória de cálculo — transparência */}
        <details style={{ marginTop: 'var(--e-6)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--t-sm)', fontWeight: 500 }}>
            Como chegamos a esse valor
          </summary>
          <table className="tabela" style={{ marginTop: 'var(--e-4)' }}>
            <tbody>
              <tr><td>Região de referência</td><td className="num">{resultado.memoriaCalculo.regiao}</td></tr>
              <tr><td>Valor base do m²</td><td className="num">{formatarBRL(resultado.memoriaCalculo.valorM2Base)}</td></tr>
              <tr><td>Área considerada</td><td className="num">{resultado.memoriaCalculo.area} m²</td></tr>
              <tr><td>Ajuste por padrão</td><td className="num">×{resultado.memoriaCalculo.fatorPadrao}</td></tr>
              <tr><td>Ajuste por idade</td><td className="num">×{resultado.memoriaCalculo.fatorIdade}</td></tr>
              <tr><td>Vagas de garagem</td><td className="num">{resultado.memoriaCalculo.vagas}</td></tr>
              {resultado.memoriaCalculo.areaTerrenoExcedente > 0 && (
                <>
                  <tr><td>Terreno excedente à construção</td><td className="num">{resultado.memoriaCalculo.areaTerrenoExcedente.toFixed(0)} m²</td></tr>
                  <tr><td>Valor do m² de terreno</td><td className="num">{formatarBRL(resultado.memoriaCalculo.valorM2Terreno)}</td></tr>
                  <tr><td>Acréscimo pelo terreno</td><td className="num">{formatarBRL(resultado.memoriaCalculo.valorTerrenoExcedente)}</td></tr>
                </>
              )}
            </tbody>
          </table>
        </details>

        {/* Upsell do laudo */}
        <div className="cartao" style={{ marginTop: 'var(--e-8)', borderLeft: '3px solid var(--selo)' }}>
          <h3 style={{ marginBottom: 'var(--e-3)' }}>Precisa de um valor com precisão?</h3>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)', marginBottom: 'var(--e-4)' }}>
            A estimativa acima usa índices de mercado. Uma avaliação precisa considera
            o estado real do imóvel, a rua, a vista, o andar e comparáveis efetivamente
            negociados na região — feita presencialmente por perito credenciado.
          </p>
          <table className="tabela" style={{ marginBottom: 'var(--e-4)' }}>
            <tbody>
              <tr><td>Avaliação precisa — imóvel padrão</td><td className="num">R$ 397</td></tr>
              <tr><td>Avaliação precisa — alto padrão</td><td className="num">R$ 497</td></tr>
            </tbody>
          </table>
          <a href="https://wa.me/5562000000000" className="btn" style={{ display: 'inline-block' }}>
            Solicitar avaliação precisa
          </a>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)', marginTop: 'var(--e-3)' }}>
            {/* TODO: trocar pelo número real de WhatsApp do corretor */}
            Você receberá o contato do perito para agendar a visita.
          </p>
        </div>

        <div className="legal" style={{ marginTop: 'var(--e-6)' }}>{DISCLAIMER_ESTIMATIVA}</div>

        <button onClick={recomecar} className="btn btn-secundario" style={{ marginTop: 'var(--e-6)' }}>
          Avaliar outro imóvel
        </button>
      </div>
    );
  }

  /* ── Formulário ────────────────────────────────────── */
  return (
    <div className="container-estreito" style={{ padding: 'var(--e-12) var(--e-6)' }}>
      {etapa === 'imovel' ? (
        <>
          <h1 style={{ marginBottom: 'var(--e-3)' }}>Quanto vale o seu imóvel?</h1>
          <p style={{ color: 'var(--tinta-suave)', marginBottom: 'var(--e-8)' }}>
            Estimativa gratuita baseada em índices de mercado de Goiânia.
            Leva menos de um minuto.
          </p>

          <form onSubmit={irParaContato}>
            <div className="campo">
              <label htmlFor="tipo">Tipo de imóvel</label>
              <select id="tipo" value={imovel.tipo} onChange={(e) => mudarImovel('tipo', e.target.value)}>
                {TIPOS_IMOVEL.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="bairro">Bairro</label>
              <input id="bairro" list="bairros" value={imovel.bairro}
                onChange={(e) => mudarImovel('bairro', e.target.value)}
                placeholder="Comece a digitar o bairro" />
              <datalist id="bairros">
                {LISTA_BAIRROS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>

            <div className={ehCasa ? 'grid-3' : 'grid-2'}>
              <div className="campo">
                <label htmlFor="area">{rotuloArea(imovel.tipo)} (m²)</label>
                <input id="area" type="number" min="1" value={imovel.area}
                  onChange={(e) => mudarImovel('area', e.target.value)} placeholder="120" />
              </div>
              {!ehTerreno && (
                <div className="campo">
                  <label htmlFor="quartos">Quartos</label>
                  <input id="quartos" type="number" min="0" value={imovel.quartos}
                    onChange={(e) => mudarImovel('quartos', e.target.value)} placeholder="3" />
                </div>
              )}
              {ehCasa && (
                <div className="campo">
                  <label htmlFor="area-total">Área total do terreno (m²)</label>
                  <input id="area-total" type="number" min="0" value={imovel.areaTotal}
                    onChange={(e) => mudarImovel('areaTotal', e.target.value)} placeholder="300" />
                </div>
              )}
            </div>

            {!ehTerreno && (
              <div className="grid-3">
                <div className="campo">
                  <label htmlFor="vagas">Vagas</label>
                  <input id="vagas" type="number" min="0" value={imovel.vagas}
                    onChange={(e) => mudarImovel('vagas', e.target.value)} />
                </div>
                <div className="campo">
                  <label htmlFor="padrao">Padrão</label>
                  <select id="padrao" value={imovel.padrao} onChange={(e) => mudarImovel('padrao', e.target.value)}>
                    {PADROES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="idade">Idade</label>
                  <select id="idade" value={imovel.idade} onChange={(e) => mudarImovel('idade', e.target.value)}>
                    {IDADES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {erro && <div className="aviso aviso-erro" style={{ marginBottom: 'var(--e-4)' }}>{erro}</div>}
            <button type="submit" className="btn">Continuar</button>
          </form>
        </>
      ) : (
        <>
          <button onClick={() => setEtapa('imovel')} className="btn btn-secundario btn-pequeno" style={{ marginBottom: 'var(--e-6)' }}>
            ← Voltar
          </button>
          <h1 style={{ marginBottom: 'var(--e-3)' }}>Para onde enviamos?</h1>
          <p style={{ color: 'var(--tinta-suave)', marginBottom: 'var(--e-8)' }}>
            A estimativa aparece na tela em seguida.
          </p>

          <form onSubmit={enviar}>
            <div className="campo">
              <label htmlFor="nome">Nome</label>
              <input id="nome" value={contato.nome} required
                onChange={(e) => setContato({ ...contato, nome: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" value={contato.email} required
                onChange={(e) => setContato({ ...contato, email: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="telefone">Telefone (opcional)</label>
              <input id="telefone" value={contato.telefone}
                onChange={(e) => setContato({ ...contato, telefone: e.target.value })}
                placeholder="(62) 90000-0000" />
            </div>

            <label style={{ display: 'flex', gap: 'var(--e-3)', alignItems: 'flex-start', fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)', marginBottom: 'var(--e-6)', cursor: 'pointer' }}>
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)}
                style={{ marginTop: 3, flexShrink: 0 }} />
              <span>{TEXTO_LGPD}</span>
            </label>

            {erro && <div className="aviso aviso-erro" style={{ marginBottom: 'var(--e-4)' }}>{erro}</div>}
            <button type="submit" className="btn" disabled={carregando}>
              {carregando ? 'Calculando…' : 'Ver a estimativa'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
