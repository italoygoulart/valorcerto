/**
 * Upload de fotos do imóvel e documentos (matrícula, IPTU etc.), reutilizado
 * na estimativa gratuita (proprietário) e na avaliação por comparáveis
 * (corretor). O componente só dispara o envio e mostra o que já foi
 * enviado — quem sabe PARA QUAL avaliação enviar é o componente pai,
 * via a prop `enviar`.
 */
import { useState } from 'react';

const TIPOS_ACEITOS = 'image/jpeg,image/png,image/webp,application/pdf';

export default function UploadAnexos({ enviar, anexos, setAnexos, rotulo }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function aoSelecionarArquivos(e) {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois
    if (arquivos.length === 0) return;

    setErro('');
    setEnviando(true);
    try {
      const r = await enviar(arquivos);
      setAnexos((atual) => [...atual, ...r.anexos]);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="campo">
      <label>{rotulo || 'Fotos do imóvel e documentos (opcional)'}</label>
      <input
        type="file"
        accept={TIPOS_ACEITOS}
        multiple
        onChange={aoSelecionarArquivos}
        disabled={enviando}
      />
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)', marginTop: 'var(--e-1)' }}>
        JPG, PNG, WEBP ou PDF — até 10MB por arquivo.
      </p>

      {enviando && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--tinta-suave)', marginTop: 'var(--e-2)' }}>
          Enviando…
        </p>
      )}
      {erro && <div className="aviso aviso-erro" style={{ marginTop: 'var(--e-2)' }}>{erro}</div>}

      {anexos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--e-3)', marginTop: 'var(--e-4)' }}>
          {anexos.map((a) => (
            <div key={a.id} style={{ width: 76 }}>
              {a.tipo === 'foto' ? (
                <img
                  src={a.url}
                  alt={a.nomeOriginal}
                  style={{
                    width: 76, height: 76, objectFit: 'cover',
                    borderRadius: 'var(--raio)', border: '1px solid var(--linha)',
                  }}
                />
              ) : (
                <div style={{
                  width: 76, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--linha)', borderRadius: 'var(--raio)',
                  fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)',
                }}>
                  PDF
                </div>
              )}
              <p style={{
                fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)', marginTop: 'var(--e-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={a.nomeOriginal}>
                {a.nomeOriginal}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
