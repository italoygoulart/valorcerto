import { Link, useNavigate, useLocation } from 'react-router-dom';
import { setToken } from '../lib/api.js';

export default function Layout({ children, usuario, aoSair }) {
  const navegar = useNavigate();
  const local = useLocation();

  function sair() {
    setToken(null);
    aoSair?.();
    navegar('/');
  }

  return (
    <>
      <header style={{ borderBottom: '1px solid var(--linha)', background: 'var(--papel)' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link to="/" style={{ color: 'var(--tinta)', textDecoration: 'none' }}>
            <span style={{ fontFamily: 'var(--fonte-titulo)', fontSize: '1.35rem', fontWeight: 700 }}>Valor Certo</span>
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)', marginLeft: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>Goiânia</span>
          </Link>

          <nav style={{ display: 'flex', gap: 'var(--e-6)', alignItems: 'center', fontSize: 'var(--t-sm)' }}>
            {local.pathname !== '/' && <Link to="/">Avaliar imóvel</Link>}
            {!usuario && <Link to="/corretor">Área do corretor</Link>}
            {usuario && (
              <>
                <Link to="/corretor/painel">Painel</Link>
                {usuario.tipo === 'admin' && <Link to="/admin">Administração</Link>}
                <button onClick={sair} className="btn btn-secundario btn-pequeno">Sair</button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer style={{ marginTop: 'var(--e-16)', borderTop: '1px solid var(--linha)', padding: 'var(--e-8) 0' }}>
        <div className="container" style={{ fontSize: 'var(--t-xs)', color: 'var(--tinta-suave)' }}>
          <p style={{ marginBottom: 'var(--e-2)' }}>
            <strong>Italo Goulart</strong> — Corretor de Imóveis e Perito Avaliador · CRECI 37644
          </p>
          <p>
            As estimativas apresentadas são referenciais e não constituem laudo de avaliação.
            Laudo com validade jurídica deve ser elaborado por profissional credenciado,
            conforme ABNT NBR 14653.
          </p>
        </div>
      </footer>
    </>
  );
}
