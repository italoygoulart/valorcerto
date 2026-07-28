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
  db.js          Schema SQLite (9 tabelas)
  auth.js        JWT, hash de senha, gate de assinatura
  storage.js     Upload/download/URL assinada no Cloudflare R2
  seed.js        Usuários iniciais
  avalia.db      Banco (criado na primeira execução)

src/
  lib/
    motorFipeZap.js      Motor da estimativa gratuita
    motorComparaveis.js  Orquestrador da avaliação por comparáveis
    avaliacao/
      similaridade.js    SimilarityEngine — pontua o quão parecido é um comparável
      outliers.js        OutlierDetector — descarte de extremos e filtro de faixa
      confianca.js       ConfidenceEngine — margem e grau de confiança
    gerarPTAM.js         Gera o laudo PTAM em PDF (pdfMake), com anexo fotográfico
    disclaimers.js       Textos jurídicos obrigatórios
    api.js               Cliente HTTP
    __tests__/           Testes dos motores e módulos de avaliação (node --test)
  data/
    indiceFipeZap.js     Índices, mapa de bairros e fatores de ajuste
  pages/
    Estimativa.jsx       Tela pública (proprietário)
    Corretor.jsx         Login e cadastro
    PainelCorretor.jsx   Avaliação por comparáveis + histórico
    Admin.jsx            Leads, métricas e atualização do índice
  components/
    Layout.jsx           Cabeçalho, rodapé e navegação
    UploadAnexos.jsx     Upload de fotos/documentos (proprietário e corretor)
  styles/
    global.css           Design system (todas as variáveis)
```

---

## Os dois motores de cálculo

### Estimativa gratuita — `src/lib/motorFipeZap.js`

Cruza tipo de imóvel, região (derivada do bairro), área, padrão de
acabamento, idade e vagas. **Sempre devolve uma faixa**, nunca um número
exato — precisão aparente que o método não tem seria desonesta.

Margem declarada: **±8%** (±12% quando o bairro não está mapeado e o
sistema cai numa região de referência — sinalizado ao usuário).

### Avaliação por comparáveis — `src/lib/motorComparaveis.js`

Método comparativo direto de dados de mercado, **restrito ao bairro do
imóvel avaliando** (não expande para bairros vizinhos). `motorComparaveis.js`
é só o orquestrador — cada responsabilidade fica num módulo dedicado em
`src/lib/avaliacao/`:

1. **SimilarityEngine** (`avaliacao/similaridade.js`) pontua cada candidato
   de 0 a 1: distância 35%, área 25%, padrão construtivo 15%, idade 10%,
   vagas de garagem 8%, recência do anúncio 7%. Padrão e idade usam
   **distância ordinal** (ex.: "simples→médio" é mais parecido que
   "simples→luxo", não um simples igual/diferente). Só entram na análise
   os **6 mais similares**.
2. **OutlierDetector** (`avaliacao/outliers.js`) descarta o **mais caro**
   e o **mais barato** desse grupo (aparado fixo, mais estável que IQR
   para amostras pequenas) e depois remove quem ainda ficar fora de
   **±15% da média do grupo**.
3. Calcula o valor final pela **média ponderada por similaridade** dos
   comparáveis que restaram.
4. **ConfidenceEngine** (`avaliacao/confianca.js`) traduz a dispersão da
   amostra final em faixa (piso 8%, teto 15%) e grau de confiança.

Toda avaliação grava uma **memória de cálculo** auditável: entradas,
comparáveis usados, os que foram excluídos e por quê (falta de
similaridade, extremo de preço ou fora da faixa de ±15%), pesos aplicados
e fórmula. Isso é requisito de credibilidade profissional.

Os pesos de vagas e recência do anúncio ficam "adormecidos" enquanto
`buscarComparaveis()` for simulada (ela copia as vagas do próprio
avaliando e usa sempre a data de hoje) — passam a diferenciar
comparáveis assim que houver uma fonte real ou comparáveis manuais que
variem nessas duas dimensões.

### Laudo PTAM — `src/lib/gerarPTAM.js`

A partir do resultado da avaliação por comparáveis, o corretor preenche os
dados registrais e de vistoria e gera o **Parecer Técnico de Avaliação
Mercadológica em PDF** (via `pdfMake`), já estruturado nas 9 seções da
NBR 14.653 (Partes 1 e 2), com valor por extenso e assinatura do CRECI/CNAI.
Diferente da estimativa gratuita, este documento **não** leva o aviso de
"sem validade jurídica" — ele é o próprio laudo técnico.

### Testes

```bash
npm test    # node --test — cobre os dois motores de cálculo
```

---

## Fotos e documentos anexados

Tanto o proprietário (na tela de estimativa gratuita, após ver o
resultado) quanto o corretor (ao gerar o laudo) podem anexar **fotos do
imóvel** e **documentos** (matrícula, IPTU etc.) — JPG, PNG, WEBP ou PDF,
até 10MB por arquivo, no máximo 15 arquivos por avaliação.

Os arquivos ficam no **Cloudflare R2** (compatível com S3), num bucket
**privado** — nunca há URL pública direta. Toda leitura passa por URL
assinada de validade curta (`server/storage.js`), e o laudo PTAM busca as
fotos através de uma rota própria da API (autenticada), não diretamente
do bucket, para não depender de CORS configurado no R2.

Variáveis de ambiente necessárias (`.env`, nunca commitado):

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=...
```

Gere o Access Key ID/Secret em **Cloudflare Dashboard → R2 Object Storage
→ (dentro do bucket) → Settings → S3 API Compatibility → Manage API
tokens**, com permissão de leitura e escrita.

As fotos do laudo entram automaticamente numa seção **"Anexo
Fotográfico"** do PDF gerado.

---

## O que falta para produção

### 1. Busca real de comparáveis — `src/lib/motorComparaveis.js`

A função `buscarComparaveis()` está **simulada**. Gera dados de exemplo
em torno do imóvel avaliando.

Em produção, deve consumir uma **API de busca web legítima**, restrita ao
**bairro do imóvel avaliando** (decisão de produto: não expandir a busca
para bairros vizinhos).

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
`memorias_calculo`, `comparaveis`, `assinaturas`, `indices_fipezap`, `anexos`.

---

## Deploy

Frontend: Vercel ou Netlify (build estático via `npm run build`).
API: Railway, Render ou Fly.io.

Definir `JWT_SECRET` nas variáveis de ambiente — o fallback em
`server/auth.js` serve apenas para desenvolvimento. Com `NODE_ENV=production`
e sem essa variável, o servidor **recusa subir** (falha no boot) em vez de
usar o fallback silenciosamente.

Também definir as variáveis `R2_*` (ver seção "Fotos e documentos
anexados") para o upload funcionar em produção.
