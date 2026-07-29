import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Estimativa from './pages/Estimativa.jsx';
import Corretor from './pages/Corretor.jsx';
import PainelCorretor from './pages/PainelCorretor.jsx';
import Admin from './pages/Admin.jsx';
import { api, getToken } from './lib/api.js';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [creditosDisponiveis, setCreditosDisponiveis] = useState(0);
  const [pronto, setPronto] = useState(false);

  function carregarSessao() {
    if (!getToken()) { setUsuario(null); setPronto(true); return; }
    api.eu()
      .then((r) => {
        setUsuario(r.usuario);
        setAssinaturaAtiva(r.assinaturaAtiva);
        setCreditosDisponiveis(r.creditosDisponiveis || 0);
      })
      .catch(() => setUsuario(null))
      .finally(() => setPronto(true));
  }

  useEffect(carregarSessao, []);

  if (!pronto) {
    return <div className="container" style={{ padding: 'var(--e-16)' }}><p className="carregando">Carregando…</p></div>;
  }

  return (
    <Layout usuario={usuario} aoSair={() => { setUsuario(null); setAssinaturaAtiva(false); setCreditosDisponiveis(0); }}>
      <Routes>
        <Route path="/" element={<Estimativa />} />
        <Route path="/corretor" element={
          usuario ? <Navigate to="/corretor/painel" replace /> : <Corretor aoEntrar={carregarSessao} />
        } />
        <Route path="/corretor/painel" element={
          usuario
            ? <PainelCorretor
                usuario={usuario}
                assinaturaAtiva={assinaturaAtiva}
                creditosDisponiveis={creditosDisponiveis}
                aoAssinar={carregarSessao}
              />
            : <Navigate to="/corretor" replace />
        } />
        <Route path="/admin" element={
          usuario?.tipo === 'admin' ? <Admin /> : <Navigate to="/" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
