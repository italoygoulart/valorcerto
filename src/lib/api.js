/** Cliente da API. Guarda o token em memória + sessionStorage. */

const BASE = '/api';

export function getToken() {
  try { return sessionStorage.getItem('token'); } catch { return null; }
}
export function setToken(t) {
  try { t ? sessionStorage.setItem('token', t) : sessionStorage.removeItem('token'); } catch {}
}

async function req(caminho, opcoes = {}) {
  const token = getToken();
  const res = await fetch(BASE + caminho, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcoes.headers,
    },
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || 'Não foi possível completar a operação.');
  return dados;
}

export const api = {
  estimativa: (corpo) => req('/estimativa', { method: 'POST', body: JSON.stringify(corpo) }),
  login: (corpo) => req('/auth/login', { method: 'POST', body: JSON.stringify(corpo) }),
  cadastro: (corpo) => req('/auth/cadastro', { method: 'POST', body: JSON.stringify(corpo) }),
  eu: () => req('/auth/eu'),
  assinar: (plano) => req('/assinatura/criar', { method: 'POST', body: JSON.stringify({ plano }) }),
  avaliar: (corpo) => req('/corretor/avaliar', { method: 'POST', body: JSON.stringify(corpo) }),
  historico: () => req('/corretor/historico'),
  avaliacao: (id) => req(`/corretor/avaliacao/${id}`),
  salvarLaudo: (id, corpo) => req(`/corretor/avaliacao/${id}/laudo`, { method: 'PUT', body: JSON.stringify(corpo) }),
  leads: () => req('/admin/leads'),
  metricas: () => req('/admin/metricas'),
  indice: () => req('/admin/indice'),
  salvarIndice: (corpo) => req('/admin/indice', { method: 'POST', body: JSON.stringify(corpo) }),
};
