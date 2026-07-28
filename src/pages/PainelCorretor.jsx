/**
 * PAINEL DO CORRETOR — avaliação por comparáveis
 * Item 2.2 do briefing. Gate de assinatura, busca de comparáveis com
 * controle manual, memória de cálculo e histórico.
 */
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { formatarBRL } from '../lib/motorFipeZap.js';
import { DISCLAIMER_COMPARAVEIS } from '../lib/disclaimers.js';
import { LISTA_BAIRROS, TIPOS_IMOVEL, PADROES, IDADES, rotuloArea } from '../data/indiceFipeZap.js';
import { gerarPTAM } from '../lib/gerarPTAM.js';
import UploadAnexos from '../components/UploadAnexos.jsx';

const ESTADOS_CONSERVACAO = ['Novo', 'Seminovo', 'Usado', 'Ocupado'];
const GRAUS = ['Grau I', 'Grau II', 'Grau III'];

function diagnosticoPadrao(bairro) {
  return bairro
    ? `O imóvel avaliando está localizado no bairro ${bairro}, em Goiânia/GO. A região apresenta ` +
      'infraestrutura urbana consolidada, com liquidez de mercado classificada como média a boa para ' +
      'imóveis de padrão semelhante, especialmente quando bem conservados e com preço compatível com o ' +
      'mercado. A demanda observada é sustentada por famílias e investidores interessados na região.'
    : '';
}

export default function PainelCorretor({ usuario, assinaturaAtiva, aoAssinar }) {
  const [aba, setAba] = useState('avaliar');
  const [imovel, setImovel] = useState({
    tipo: 'apartamento', bairro: '', area: '', areaTotal: '', vagas: '0',
    padrao: 'medio', idade: 'seminovo', endereco: '',
  });
  const [resultado, setResultado] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [gerandoLaudo, setGerandoLaudo] = useState(false);
  const [erroLaudo, setErroLaudo] = useState('');
  const [anexos, setAnexos] = useState([]);
  const [laudo, setLaudo] = useState({
    solicitanteNome: '', solicitanteCpf: '', finalidade: '', objetivo: '',
    matricula: '', inscricaoCadastral: '', fracaoIdeal: '', vagaGaragem: '',
    andar: '', dormitorios: '', estadoConservacao: 'Novo', dataVistoria: '',
    diagnosticoMercado: '', grauFundamentacao: 'Grau II', grauPrecisao: 'Grau III',
  });

  useEffect(() => {
    if (aba === 'historico' && assinaturaAtiva) {
      api.historico().then(setHistorico).catch(() => {});
    }
  }, [aba, assinaturaAtiva]);

  /* ── Gate de assinatura ────────────────────────────── */
  if (!assinaturaAtiva) {
    return (
      <div className="container-estreito" style={{ padding: 'var(--e-12) var(--e-6)' }}>
        <h1 style={{ marginBottom: 'var(--e-3)' }}>Ative sua assinatura</h1>
        <p style={{ color: 'var(--tinta-suave)', marginBottom: 'var(--e-8)' }}>
          A avaliação por comparação de mercado está disponível para assinantes.
        </p>

        <div className="grid-2">
          <div className="cartao">
            <h3>Mensal</h3>
            <div className="numero" style={{ fontSize: 'var(--t-xl)', margin: 'var(--e-3) 0' }}>R$ 89<span style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)' }}>/mês</span></div>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)', marginBottom: 'var(--e-4)' }}>
              Avaliações ilimitadas. Cancele quando quiser.
            </p>
            <button className="btn" style={{ width: '100%' }}
              onClick={() => api.assinar('mensal').then(aoAssinar)}>
              Assinar mensal
            </button>
          </div>

          <div className="cartao" style={{ borderColor: 'var(--selo)', borderWidth: 2 }}>
            <h3>Anual</h3>
            <div className="numero" style={{ fontSize: 'var(--t-xl)', margin: 'var(--e-3) 0' }}>R$ 69<span style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)' }}>/mês</span></div>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)', marginBottom: 'var(--e-4)' }}>
              Cobrado R$ 828 por ano. Economia de R$ 240.
            </p>
            <button className="btn" style={{ width: '100%' }}
              onClick={() => api.assinar('anual').then(aoAssinar)}>
              Assinar anual
            </button>
          </div>
        </div>

        <div className="aviso" style={{ marginTop: 'var(--e-8)' }}>
          <strong>Ambiente de teste:</strong> a assinatura é ativada sem cobrança real.
          A integração com gateway de pagamento (com Pix) está pendente — ver item 5
          do briefing técnico.
        </div>
      </div>
    );
  }

  async function avaliar(e) {
    e.preventDefault();
    setErro('');
    if (!imovel.bairro || !imovel.area) {
      setErro('Informe ao menos o bairro e a área.');
      return;
    }
    setCarregando(true);
    setResultado(null);
    setAnexos([]);
    try {
      const r = await api.avaliar({
        imovel: {
          ...imovel, area: Number(imovel.area), areaTotal: Number(imovel.areaTotal) || null,
          vagas: Number(imovel.vagas) || 0,
        },
      });
      setResultado(r);
      setLaudo((l) => ({ ...l, diagnosticoMercado: l.diagnosticoMercado || diagnosticoPadrao(imovel.bairro) }));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  async function gerarLaudo() {
    setErroLaudo('');
    if (!laudo.solicitanteNome || !laudo.dataVistoria) {
      setErroLaudo('Informe ao menos o solicitante e a data da vistoria.');
      return;
    }
    setGerandoLaudo(true);
    try {
      await api.salvarLaudo(resultado.avaliacaoId, laudo);
      await gerarPTAM({
        fotos: anexos.filter((a) => a.tipo === 'foto'),
        avaliador: { nome: usuario.nome, creci: usuario.creci, cnai: usuario.cnai, email: usuario.email },
        solicitante: { nome: laudo.solicitanteNome, cpf: laudo.solicitanteCpf },
        finalidade: laudo.finalidade,
        objetivo: laudo.objetivo,
        imovel: {
          tipo: imovel.tipo,
          tipoLabel: TIPOS_IMOVEL.find((t) => t.id === imovel.tipo)?.label,
          endereco: imovel.endereco,
          bairro: imovel.bairro,
          area: imovel.area,
          areaTotal: imovel.areaTotal,
          vagas: imovel.vagas,
          matricula: laudo.matricula,
          inscricaoCadastral: laudo.inscricaoCadastral,
          fracaoIdeal: laudo.fracaoIdeal,
          vagaGaragem: laudo.vagaGaragem,
          andar: laudo.andar,
          dormitorios: laudo.dormitorios,
          estadoConservacao: laudo.estadoConservacao,
          padraoLabel: PADROES.find((p) => p.id === imovel.padrao)?.label,
        },
        diagnosticoMercado: laudo.diagnosticoMercado,
        resultado,
        grauFundamentacao: laudo.grauFundamentacao,
        grauPrecisao: laudo.grauPrecisao,
        dataVistoria: laudo.dataVistoria,
      });
    } catch (e) {
      setErroLaudo(e.message);
    } finally {
      setGerandoLaudo(false);
    }
  }

  return (
    <div className="container" style={{ padding: 'var(--e-8) var(--e-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--e-6)', borderBottom: '1px solid var(--linha)', marginBottom: 'var(--e-8)' }}>
        {[['avaliar', 'Nova avaliação'], ['historico', 'Histórico']].map(([id, label]) => (
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

      {aba === 'historico' ? (
        <>
          <h2 style={{ marginBottom: 'var(--e-6)' }}>Avaliações anteriores</h2>
          {historico.length === 0 ? (
            <p style={{ color: 'var(--tinta-suave)' }}>Nenhuma avaliação ainda. Faça a primeira na aba ao lado.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr><th>Data</th><th>Imóvel</th><th>Bairro</th><th style={{ textAlign: 'right' }}>Área</th><th style={{ textAlign: 'right' }}>Valor estimado</th></tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td className="num">{h.criado_em?.slice(0, 10)}</td>
                    <td>{h.imovel_tipo}</td>
                    <td>{h.bairro}</td>
                    <td className="num">{h.area} m²</td>
                    <td className="num">{formatarBRL(h.valor_central)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: resultado ? '380px 1fr' : '1fr', gap: 'var(--e-8)', alignItems: 'start' }}>
          <div className="cartao">
            <h2 style={{ marginBottom: 'var(--e-6)', fontSize: 'var(--t-lg)' }}>Dados do imóvel</h2>
            <form onSubmit={avaliar}>
              <div className="campo">
                <label htmlFor="c-tipo">Tipo</label>
                <select id="c-tipo" value={imovel.tipo} onChange={(e) => setImovel({ ...imovel, tipo: e.target.value })}>
                  {TIPOS_IMOVEL.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="c-endereco">Endereço (opcional)</label>
                <input id="c-endereco" value={imovel.endereco}
                  onChange={(e) => setImovel({ ...imovel, endereco: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor="c-bairro">Bairro</label>
                <input id="c-bairro" list="c-bairros" value={imovel.bairro}
                  onChange={(e) => setImovel({ ...imovel, bairro: e.target.value })} />
                <datalist id="c-bairros">
                  {LISTA_BAIRROS.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div className={imovel.tipo === 'casa' ? 'grid-3' : 'grid-2'}>
                <div className="campo">
                  <label htmlFor="c-area">{rotuloArea(imovel.tipo)} (m²)</label>
                  <input id="c-area" type="number" value={imovel.area}
                    onChange={(e) => setImovel({ ...imovel, area: e.target.value })} />
                </div>
                {imovel.tipo === 'casa' && (
                  <div className="campo">
                    <label htmlFor="c-area-total">Área total do terreno (m²)</label>
                    <input id="c-area-total" type="number" value={imovel.areaTotal}
                      onChange={(e) => setImovel({ ...imovel, areaTotal: e.target.value })} />
                  </div>
                )}
                <div className="campo">
                  <label htmlFor="c-vagas">Vagas</label>
                  <input id="c-vagas" type="number" min="0" value={imovel.vagas}
                    onChange={(e) => setImovel({ ...imovel, vagas: e.target.value })} />
                </div>
              </div>
              <div className="grid-2">
                <div className="campo">
                  <label htmlFor="c-padrao">Padrão</label>
                  <select id="c-padrao" value={imovel.padrao} onChange={(e) => setImovel({ ...imovel, padrao: e.target.value })}>
                    {PADROES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="c-idade">Idade</label>
                  <select id="c-idade" value={imovel.idade} onChange={(e) => setImovel({ ...imovel, idade: e.target.value })}>
                    {IDADES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                  </select>
                </div>
              </div>

              {erro && <div className="aviso aviso-erro" style={{ marginBottom: 'var(--e-4)' }}>{erro}</div>}
              <button type="submit" className="btn" disabled={carregando} style={{ width: '100%' }}>
                {carregando ? 'Buscando comparáveis…' : 'Avaliar'}
              </button>
            </form>
          </div>

          {resultado && (
            <div>
              <div className="cartao" style={{ marginBottom: 'var(--e-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--e-4)' }}>
                  <div>
                    <p style={{ fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tinta-suave)' }}>
                      Valor estimado
                    </p>
                    <div className="numero" style={{ fontSize: 'var(--t-2xl)', fontWeight: 500 }}>
                      {formatarBRL(resultado.valorEstimado)}
                    </div>
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)' }}>
                      Faixa: {formatarBRL(resultado.valorMinimo)} – {formatarBRL(resultado.valorMaximo)}
                    </p>
                  </div>
                  <span className={`etiqueta etiqueta-${resultado.grauConfianca.nivel}`}>
                    confiança {resultado.grauConfianca.nivel}
                  </span>
                </div>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)' }}>
                  {resultado.grauConfianca.texto} · Valor do m² ponderado:{' '}
                  <span className="numero">{formatarBRL(resultado.valorM2Ponderado)}</span>
                </p>
              </div>

              <h3 style={{ marginBottom: 'var(--e-3)', fontSize: 'var(--t-base)' }}>
                Comparáveis utilizados ({resultado.memoriaCalculo.qtdSelecionados})
              </h3>
              <table className="tabela" style={{ marginBottom: 'var(--e-6)' }}>
                <thead>
                  <tr>
                    <th>Referência</th><th style={{ textAlign: 'right' }}>Área</th>
                    <th style={{ textAlign: 'right' }}>Anúncio</th><th style={{ textAlign: 'right' }}>R$/m²</th>
                    <th style={{ textAlign: 'right' }}>Dist.</th><th style={{ textAlign: 'right' }}>Simil.</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.memoriaCalculo.comparaveisUsados.map((c, i) => (
                    <tr key={i}>
                      <td>{c.endereco}</td>
                      <td className="num">{c.area} m²</td>
                      <td className="num">{formatarBRL(c.valorAnuncio)}</td>
                      <td className="num">{formatarBRL(c.valorM2)}</td>
                      <td className="num">{c.distanciaKm} km</td>
                      <td className="num">{(c.similaridade * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {resultado.memoriaCalculo.comparaveisExcluidos.length > 0 && (
                <details style={{ marginBottom: 'var(--e-6)' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 'var(--t-sm)' }}>
                    {resultado.memoriaCalculo.comparaveisExcluidos.length} comparável(is) excluído(s)
                  </summary>
                  <table className="tabela" style={{ marginTop: 'var(--e-3)' }}>
                    <tbody>
                      {resultado.memoriaCalculo.comparaveisExcluidos.map((c, i) => (
                        <tr key={i}>
                          <td>{c.endereco}</td>
                          <td className="num">{formatarBRL(c.valorM2)}/m²</td>
                          <td style={{ color: 'var(--tinta-suave)' }}>{c.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              <details>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--t-sm)', fontWeight: 500 }}>
                  Memória de cálculo completa
                </summary>
                <pre style={{
                  marginTop: 'var(--e-3)', fontSize: 'var(--t-xs)', fontFamily: 'var(--fonte-numero)',
                  background: 'var(--papel-fundo)', padding: 'var(--e-4)', overflow: 'auto',
                  border: '1px solid var(--linha)', maxHeight: 320,
                }}>
                  {JSON.stringify(resultado.memoriaCalculo, null, 2)}
                </pre>
              </details>

              <div className="legal" style={{ marginTop: 'var(--e-6)' }}>{DISCLAIMER_COMPARAVEIS}</div>

              <div className="cartao" style={{ marginTop: 'var(--e-6)' }}>
                <h3 style={{ marginBottom: 'var(--e-2)', fontSize: 'var(--t-base)' }}>Gerar laudo (PTAM)</h3>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)', marginBottom: 'var(--e-4)' }}>
                  Preencha os dados abaixo para emitir o Parecer Técnico de Avaliação Mercadológica em PDF,
                  no padrão NBR 14.653, assinado com seu CRECI/CNAI.
                </p>

                <div className="grid-2">
                  <div className="campo">
                    <label htmlFor="l-solicitante">Solicitante / Adquirente</label>
                    <input id="l-solicitante" value={laudo.solicitanteNome}
                      onChange={(e) => setLaudo({ ...laudo, solicitanteNome: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label htmlFor="l-cpf">CPF/CNPJ</label>
                    <input id="l-cpf" value={laudo.solicitanteCpf}
                      onChange={(e) => setLaudo({ ...laudo, solicitanteCpf: e.target.value })} />
                  </div>
                </div>
                <div className="campo">
                  <label htmlFor="l-finalidade">Finalidade</label>
                  <input id="l-finalidade" placeholder="Ex.: instruir impugnação do ITBI"
                    value={laudo.finalidade} onChange={(e) => setLaudo({ ...laudo, finalidade: e.target.value })} />
                </div>
                <div className="campo">
                  <label htmlFor="l-objetivo">Objetivo</label>
                  <input id="l-objetivo" placeholder="Ex.: determinação do valor de mercado para compra e venda"
                    value={laudo.objetivo} onChange={(e) => setLaudo({ ...laudo, objetivo: e.target.value })} />
                </div>

                <div className="grid-2">
                  <div className="campo">
                    <label htmlFor="l-matricula">Matrícula</label>
                    <input id="l-matricula" value={laudo.matricula}
                      onChange={(e) => setLaudo({ ...laudo, matricula: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label htmlFor="l-inscricao">Inscrição cadastral</label>
                    <input id="l-inscricao" value={laudo.inscricaoCadastral}
                      onChange={(e) => setLaudo({ ...laudo, inscricaoCadastral: e.target.value })} />
                  </div>
                </div>
                <div className="grid-3">
                  <div className="campo">
                    <label htmlFor="l-fracao">Fração ideal</label>
                    <input id="l-fracao" placeholder="Ex.: 0,55751%" value={laudo.fracaoIdeal}
                      onChange={(e) => setLaudo({ ...laudo, fracaoIdeal: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label htmlFor="l-vaga">Vaga de garagem</label>
                    <input id="l-vaga" placeholder="Ex.: nº 99, coberta" value={laudo.vagaGaragem}
                      onChange={(e) => setLaudo({ ...laudo, vagaGaragem: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label htmlFor="l-andar">Andar / pavimento</label>
                    <input id="l-andar" value={laudo.andar}
                      onChange={(e) => setLaudo({ ...laudo, andar: e.target.value })} />
                  </div>
                </div>
                <div className="grid-3">
                  <div className="campo">
                    <label htmlFor="l-dormitorios">Dormitórios / suítes</label>
                    <input id="l-dormitorios" placeholder="Ex.: 2 suítes" value={laudo.dormitorios}
                      onChange={(e) => setLaudo({ ...laudo, dormitorios: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label htmlFor="l-conservacao">Estado de conservação</label>
                    <select id="l-conservacao" value={laudo.estadoConservacao}
                      onChange={(e) => setLaudo({ ...laudo, estadoConservacao: e.target.value })}>
                      {ESTADOS_CONSERVACAO.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor="l-vistoria">Data da vistoria</label>
                    <input id="l-vistoria" type="date" value={laudo.dataVistoria}
                      onChange={(e) => setLaudo({ ...laudo, dataVistoria: e.target.value })} />
                  </div>
                </div>

                <div className="campo">
                  <label htmlFor="l-diagnostico">Diagnóstico de mercado</label>
                  <textarea id="l-diagnostico" rows={5} value={laudo.diagnosticoMercado}
                    onChange={(e) => setLaudo({ ...laudo, diagnosticoMercado: e.target.value })}
                    style={{
                      width: '100%', fontFamily: 'var(--fonte-corpo)', fontSize: 'var(--t-base)',
                      padding: 'var(--e-3)', border: '1px solid var(--linha)', borderRadius: 'var(--raio)',
                      background: 'var(--papel-fundo)', color: 'var(--tinta)', resize: 'vertical',
                    }} />
                </div>

                <div className="grid-2">
                  <div className="campo">
                    <label htmlFor="l-fundamentacao">Grau de fundamentação</label>
                    <select id="l-fundamentacao" value={laudo.grauFundamentacao}
                      onChange={(e) => setLaudo({ ...laudo, grauFundamentacao: e.target.value })}>
                      {GRAUS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor="l-precisao">Grau de precisão</label>
                    <select id="l-precisao" value={laudo.grauPrecisao}
                      onChange={(e) => setLaudo({ ...laudo, grauPrecisao: e.target.value })}>
                      {GRAUS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                <UploadAnexos
                  enviar={(arquivos) => api.anexarAvaliacao(resultado.avaliacaoId, arquivos)}
                  anexos={anexos}
                  setAnexos={setAnexos}
                  rotulo="Fotos do imóvel e documentos (matrícula, IPTU etc.)"
                />
                <p style={{ fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)', marginBottom: 'var(--e-4)' }}>
                  As fotos entram automaticamente no anexo fotográfico do PDF.
                </p>

                {erroLaudo && <div className="aviso aviso-erro" style={{ marginBottom: 'var(--e-4)' }}>{erroLaudo}</div>}
                <button className="btn" style={{ width: '100%' }} disabled={gerandoLaudo} onClick={gerarLaudo}>
                  {gerandoLaudo ? 'Gerando PDF…' : 'Gerar laudo PTAM (PDF)'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
