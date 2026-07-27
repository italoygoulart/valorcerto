# Valor Certo — Avaliação Patrimonial de Imóveis

Aplicação web de avaliação de imóveis para o mercado de Goiânia/GO.
Desenvolvida para **Italo Goulart** — Corretor de Imóveis e Perito Avaliador, CRECI 37644.

> **Status: MVP funcional para demonstração.**
> Três integrações estão pendentes e sinalizadas no código. Ver seção
> "O que falta para produção".

---

## Como rodar

Requisitos: Node.js 18 ou superior.

```bash
npm install
npm run seed     # cria usuários de teste
npm run dev      # sobe API (3001) e frontend (5173)
```

Acesse **http://localhost:5173**

### Usuários de teste

| Perfil | E-mail | Senha | Observação |
|---|---|---|---|
| Administrador | admin@avalia.local | admin123 | Vê leads, métricas e índice |
| Corretor | corretor@avalia.local | teste123 | Já com assinatura ativa |

Para testar o fluxo de assinatura do zero, cadastre um corretor novo pela
própria tela — ele nasce sem assinatura e cai na tela de planos.

---

## Estrutura

```
server/
  index.js       API Express — todas as rotas
  db.js          Schema SQLite (8 tabelas)
  auth.js        JWT, hash de senha, gate de assinatura
  seed.js        Usuários iniciais
  avalia.db      Banco (criado na primeira execução)

src/
  lib/
    motorFipeZap.js      Motor da estimativa gratuita
    motorComparaveis.js  Motor de avaliação por comparáveis
    disclaimers.js       Textos jurídicos obrigatórios
    api.js               Cliente HTTP
  data/
    indiceFipeZap.js     Índices, mapa de bairros e fatores de ajuste
  pages/
    Estimativa.jsx       Tela pública (proprietário)
    Corretor.jsx         Login e cadastro
    PainelCorretor.jsx   Avaliação por comparáveis + histórico
    Admin.jsx            Leads, métricas e atualização do índice
  components/
    Layout.jsx           Cabeçalho, rodapé e navegação
  styles/
    global.css           Design system (todas as variáveis)
```

---

## Os dois motores de cálculo

### Estimativa gratuita — `src/lib/motorFipeZap.js`

Cruza tipo de imóvel, região (derivada do bairro), área, padrão de
acabamento, idade e vagas. **Sempre devolve uma faixa**, nunca um número
exato — precisão aparente que o método não tem seria desonesta.

Quando o bairro não está mapeado, o sistema cai numa região de referência
e **amplia a margem de erro em 50%**, sinalizando isso ao usuário.

### Avaliação por comparáveis — `src/lib/motorComparaveis.js`

M�todo comparativo direto de dados de mercado. Seleciona candidatos,
calcula similaridade ponderada (distância 40%, área 30%, padrão 20%,
idade 10%), remove outliers pelo critério IQR e devolve valor com
intervalo de confiança.

O intervalo **cresce quando os comparáveis são dispersos** — isso é
proposital: dispersão alta significa mercado heterogêneo naquele recorte,
e o resultado deve refletir essa incerteza.

Toda avaliação grava uma **memória de cálculo** auditável: entradas,
comparáveis usados, os que foram excluídos e por quê, pesos aplicados e
fórmula. Isso é requisito de credibilidade profissional.

---

## O que falta para produção

### 1. Busca real de comparáveis — `src/lib/motorComparaveis.js`

A função `buscarComparaveis()` está **simulada**. Gera dados de exemplo
em torno do imóvel avaliando.

Em produção, deve consumir uma **API de busca web legítima**.

> **É vedado fazer scraping de portais imobiliários** (ZAP, VivaReal,
> OLX). Risco jurídico e violação de termos de uso. Esta restrição não é
> negociável — ver item 6.1 do briefing técnico.

Substituir apenas o corpo da função, mantendo o formato de retorno.

### 2. Gateway de pagamento — `server/index.js`, rota `/api/assinatura/criar`

A rota **ativa a assinatura sem cobrar**. É um stub para permitir testar
o fluxo.

Em produção: criar cobrança no gateway → aguardar confirmação por webhook
→ só então gravar status `ativa`. O gateway precisa suportar **Pix**.

Preços definidos: mensal R$ 89, anual R$ 828 (R$ 69/mês equivalente).

### 3. Índices reais do FipeZAP — `src/data/indiceFipeZap.js`

Os valores de R$/m² são **exemplos**. Substituir pelos valores reais
antes de qualquer uso comercial, pelo painel administrativo.

**Decisão de produto pendente:** o FipeZAP não publica índice bairro a
bairro para Goiânia. O agrupamento por região em `MAPA_BAIRROS` é uma
aproximação e deve ser revisado por quem conhece o mercado local. Esse
agrupamento impacta diretamente a credibilidade da estimativa.

### Outros pontos

- Notificação de novo lead ao corretor (e-mail/WhatsApp) — marcada com TODO
- Exportação em PDF estruturado (hoje usa `window.print()`)
- Validação real de CRECI junto ao COFECI (hoje valida só o formato)
- Número de WhatsApp na tela de resultado está como placeholder

---

## Conformidade

**NBR 14653.** O sistema não emite laudo com validade jurídica. Toda
saída traz disclaimer de que o valor é referencial e que laudo oficial
exige profissional credenciado. Os textos estão centralizados em
`src/lib/disclaimers.js` — **não removê-los de nenhuma saída**.

**LGPD.** O aceite é obrigatório e bloqueante: sem consentimento, não há
estimativa. Cada aceite grava texto, versão, IP e timestamp na tabela
`consentimentos_lgpd`. Há rota de exclusão de dados do titular.

---

## Banco de dados

SQLite, escolhido pela simplicidade no MVP. O schema em `server/db.js` é
compatível com PostgreSQL — a migração é direta quando o volume exigir.

Tabelas: `usuarios`, `consentimentos_lgpd`, `imoveis`, `avaliacoes`,
`memorias_calculo`, `comparaveis`, `assinaturas`, `indices_fipezap`.

---

## Deploy

Frontend: Vercel ou Netlify (build estático via `npm run build`).
API: Railway, Render ou Fly.io.

Definir `JWT_SECRET` nas variáveis de ambiente — o fallback em
`server/auth.js` serve apenas para desenvolvimento.
