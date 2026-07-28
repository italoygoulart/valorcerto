/**
 * GERADOR DO PARECER TÉCNICO DE AVALIAÇÃO MERCADOLÓGICA (PTAM)
 * =============================================================
 * Monta o PDF do laudo pago no formato fixo definido pelo avaliador,
 * seguindo a estrutura de 9 seções da NBR 14.653 (Partes 1 e 2).
 *
 * Este documento é o produto final assinado pelo corretor/avaliador —
 * ao contrário da estimativa gratuita e do resultado em tela, ele NÃO
 * leva o aviso de "sem validade jurídica": é o próprio laudo técnico.
 */
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { formatarBRL } from './motorFipeZap.js';
import { rotuloArea } from '../data/indiceFipeZap.js';
import { getToken } from './api.js';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts;

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function centenaPorExtenso(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

function numeroPorExtenso(n) {
  if (n === 0) return 'zero';
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const centenas = n % 1000;

  const partes = [];
  if (milhoes > 0) partes.push(`${centenaPorExtenso(milhoes)} ${milhoes === 1 ? 'milhão' : 'milhões'}`);
  if (milhares > 0) partes.push(milhares === 1 ? 'mil' : `${centenaPorExtenso(milhares)} mil`);
  if (centenas > 0) partes.push(centenaPorExtenso(centenas));

  if (partes.length === 1) return partes[0];
  const ultimo = partes[partes.length - 1];
  return partes.slice(0, -1).join(', ') + ' e ' + ultimo;
}

/** Valor em reais por extenso, para a seção de cálculo do valor. */
export function valorPorExtenso(valorReais) {
  const inteiro = Math.floor(valorReais);
  const centavos = Math.round((valorReais - inteiro) * 100);
  let texto = `${numeroPorExtenso(inteiro)} ${inteiro === 1 ? 'real' : 'reais'}`;
  if (centavos > 0) texto += ` e ${numeroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatarData(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

const linha = (rotulo, valor) => ({
  text: [{ text: `${rotulo}: `, bold: true }, valor || '—'],
  margin: [0, 0, 0, 6],
});

/** Converte o conteúdo de uma resposta fetch em data URI base64, formato que o pdfMake aceita como imagem. */
async function respostaParaDataUri(resp) {
  const blob = await resp.blob();
  const buffer = await blob.arrayBuffer();
  let binario = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return `data:${blob.type};base64,${btoa(binario)}`;
}

/**
 * Busca as fotos anexadas (via rota própria da API, autenticada) e monta
 * os blocos de imagem do PDF, 2 por linha. Foto que falhar ao carregar é
 * simplesmente omitida — não trava a geração do laudo.
 */
async function montarAnexoFotografico(fotos) {
  if (!fotos || fotos.length === 0) return [];

  const imagens = [];
  for (const foto of fotos) {
    try {
      const resp = await fetch(foto.urlConteudo, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) continue;
      const dataUri = await respostaParaDataUri(resp);
      imagens.push({
        stack: [
          { image: dataUri, width: 230 },
          { text: foto.nomeOriginal, fontSize: 8, color: '#666', alignment: 'center', margin: [0, 2, 0, 0] },
        ],
      });
    } catch {
      // segue sem essa foto
    }
  }

  if (imagens.length === 0) return [];

  const linhas = [];
  for (let i = 0; i < imagens.length; i += 2) {
    linhas.push({ columns: imagens.slice(i, i + 2), columnGap: 10, margin: [0, 0, 0, 10] });
  }
  return linhas;
}

/**
 * @param {Object} dados - ver PainelCorretor.jsx para o formato montado
 */
export async function gerarPTAM(dados) {
  const {
    avaliador, solicitante, finalidade, objetivo, imovel,
    diagnosticoMercado, resultado, grauFundamentacao, grauPrecisao, dataVistoria, fotos,
  } = dados;

  const linhasAnexoFotografico = await montarAnexoFotografico(fotos);
  const temAnexoFotografico = linhasAnexoFotografico.length > 0;
  const numEncerramento = temAnexoFotografico ? 10 : 9;

  const comparaveis = resultado.memoriaCalculo.comparaveisUsados;
  const enderecoCompleto = [imovel.endereco, imovel.bairro && `Bairro ${imovel.bairro}`, 'Goiânia-GO']
    .filter(Boolean).join(', ');

  const tabelaComparaveis = {
    table: {
      widths: [18, '*', 45, 32, 62, 55],
      body: [
        [
          { text: 'Nº', style: 'thCell' }, { text: 'Endereço / Fonte', style: 'thCell' },
          { text: `${rotuloArea(imovel.tipo)} (m²)`, style: 'thCell' }, { text: 'Vagas', style: 'thCell' },
          { text: 'Preço ofertado (R$)', style: 'thCell' }, { text: 'R$/m²', style: 'thCell' },
        ],
        ...comparaveis.map((c, i) => [
          String(i + 1),
          {
            stack: [
              { text: c.endereco },
              c.urlFonte
                ? { text: c.urlFonte, link: c.urlFonte, fontSize: 7, color: '#1a5fb4', margin: [0, 2, 0, 0] }
                : { text: 'Sem fonte informada', fontSize: 7, color: '#c00', italics: true, margin: [0, 2, 0, 0] },
            ],
          },
          String(c.area), String(imovel.vagas ?? 1),
          formatarBRL(c.valorAnuncio), formatarBRL(c.valorM2),
        ]),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 8, 0, 8],
  };

  const docDefinition = {
    pageMargins: [50, 60, 50, 60],
    footer: (current, total) => ({
      text: `PTAM – ${imovel.tipo} ${imovel.endereco || imovel.bairro} — Página ${current}/${total}`,
      alignment: 'center', fontSize: 8, color: '#666', margin: [0, 10, 0, 0],
    }),
    content: [
      { text: 'PARECER TÉCNICO DE AVALIAÇÃO MERCADOLÓGICA – PTAM', style: 'titulo' },
      { text: 'Elaborado em conformidade com a NBR 14.653 (Partes 1 e 2) da ABNT', style: 'subtitulo' },

      { text: '1. IDENTIFICAÇÃO DO SOLICITANTE', style: 'secao' },
      linha('Solicitante / Adquirente', solicitante.nome),
      linha('CPF/CNPJ', solicitante.cpf),
      linha('Finalidade', finalidade),
      linha('Objetivo', objetivo),

      { text: '2. IDENTIFICAÇÃO DO AVALIADOR', style: 'secao' },
      linha('Nome', avaliador.nome),
      linha('CRECI', avaliador.creci),
      linha('CNAI', avaliador.cnai),
      linha('Contato / e-mail', avaliador.email),

      { text: '3. IDENTIFICAÇÃO E CARACTERIZAÇÃO DO IMÓVEL AVALIANDO', style: 'secao' },
      linha('Imóvel', imovel.tipoLabel),
      linha('Endereço', enderecoCompleto),
      linha('Matrícula', imovel.matricula),
      linha('Inscrição cadastral', imovel.inscricaoCadastral),
      linha(rotuloArea(imovel.tipo), imovel.area ? `${imovel.area} m²` : null),
      linha('Área total', imovel.areaTotal ? `${imovel.areaTotal} m²` : null),
      linha('Fração ideal no terreno', imovel.fracaoIdeal),
      linha('Vaga de garagem', imovel.vagaGaragem),
      linha('Andar / pavimento', imovel.andar),
      linha('Nº de dormitórios / suítes', imovel.dormitorios),
      linha('Estado de conservação', imovel.estadoConservacao),
      linha('Padrão construtivo', imovel.padraoLabel),
      linha('Data da vistoria', formatarData(dataVistoria)),

      { text: '4. DIAGNÓSTICO DE MERCADO', style: 'secao' },
      { text: diagnosticoMercado || '—', margin: [0, 0, 0, 6], alignment: 'justify' },

      { text: '5. METODOLOGIA APLICADA', style: 'secao' },
      {
        text: 'Adota-se o Método Comparativo Direto de Dados de Mercado (NBR 14.653-2, item 8.2), ' +
          'que identifica o valor de mercado do bem por comparação com dados de imóveis assemelhados ' +
          'quanto às suas características intrínsecas e extrínsecas, mediante tratamento dos elementos ' +
          'amostrais e homogeneização dos valores por fatores (área, localização, padrão, conservação, ' +
          'oferta, entre outros).',
        margin: [0, 0, 0, 6], alignment: 'justify',
      },
      {
        text: 'O grau de fundamentação e de precisão foi enquadrado conforme a Tabela da NBR 14.653-2, ' +
          'em função do número de dados efetivamente utilizados, do tratamento estatístico e da amplitude ' +
          'do intervalo de confiança.',
        margin: [0, 0, 0, 6], alignment: 'justify',
      },

      { text: '6. PESQUISA E TRATAMENTO DOS DADOS DE MERCADO', style: 'secao' },
      tabelaComparaveis,
      {
        text: 'Fatores de homogeneização aplicados: os elementos comparativos foram selecionados por ' +
          'apresentarem características semelhantes às do imóvel avaliando, no mesmo bairro ou em região ' +
          `de influência equivalente. ${resultado.grauConfianca.texto} Área homogeneizada considerando ` +
          'oferta, localização, padrão construtivo, estado de conservação e vagas de garagem, conforme ' +
          'critérios técnicos da ABNT NBR 14.653.',
        margin: [0, 0, 0, 6], alignment: 'justify',
      },

      { text: '7. CÁLCULO DO VALOR', style: 'secao' },
      linha('Valor unitário médio homogeneizado (R$/m²)', formatarBRL(resultado.valorM2Ponderado)),
      linha('Área equivalente considerada (m²)', String(imovel.area)),
      linha('Campo de arbítrio / intervalo (ABNT NBR 14.653-2)', `± ${(resultado.margem * 100).toFixed(0)}% do valor central adotado`),
      { text: [{ text: 'VALOR DE MERCADO APURADO: ', bold: true }, formatarBRL(resultado.valorEstimado)], margin: [0, 4, 0, 2] },
      { text: [{ text: '(por extenso): ', italics: true }, valorPorExtenso(resultado.valorEstimado)], margin: [0, 0, 0, 8] },

      { text: '8. ENQUADRAMENTO E CONCLUSÃO', style: 'secao' },
      linha('Grau de fundamentação atingido', grauFundamentacao),
      linha('Grau de precisão atingido', grauPrecisao),
      linha('Data-base da avaliação', formatarData(dataVistoria)),
      {
        text: 'O presente parecer reflete o valor de mercado do imóvel na data-base indicada, apurado ' +
          'pelo Método Comparativo Direto de Dados de Mercado, em conformidade com a ABNT NBR 14.653 ' +
          '(Partes 1 e 2), mediante pesquisa de mercado, seleção e tratamento técnico dos elementos ' +
          'comparativos, representando o valor mais provável de negociação do imóvel nas condições ' +
          'observadas na data da avaliação.',
        margin: [0, 4, 0, 6], alignment: 'justify',
      },
      {
        text: `Conclui-se, portanto, que o valor de mercado do imóvel avaliando é de ` +
          `${formatarBRL(resultado.valorEstimado)} (${valorPorExtenso(resultado.valorEstimado)}), considerado ` +
          'compatível com as características físicas do bem, sua localização, padrão construtivo, estado ' +
          `de conservação e as condições do mercado imobiliário do bairro ${imovel.bairro}, Goiânia/GO.`,
        margin: [0, 0, 0, 6], alignment: 'justify',
      },

      ...(temAnexoFotografico
        ? [{ text: '9. ANEXO FOTOGRÁFICO', style: 'secao', pageBreak: 'before' }, ...linhasAnexoFotografico]
        : []),

      { text: `${numEncerramento}. ENCERRAMENTO E RESPONSABILIDADE TÉCNICA`, style: 'secao' },
      {
        text: 'Nada mais havendo a declarar, encerra-se o presente Parecer Técnico de Avaliação ' +
          'Mercadológica, elaborado em conformidade com a NBR 14.653 da ABNT, que vai datado e assinado.',
        margin: [0, 0, 0, 20], alignment: 'justify',
      },
      { text: `Goiânia-GO, ${formatarData(new Date().toISOString().slice(0, 10))}.`, margin: [0, 0, 0, 40] },
      { text: '_______________________________________________', margin: [0, 0, 0, 4] },
      { text: avaliador.nome, bold: true },
      { text: `Corretor de Imóveis / Avaliador — CRECI ${avaliador.creci}${avaliador.cnai ? ` — CNAI ${avaliador.cnai}` : ''}` },
    ],
    styles: {
      titulo: { fontSize: 15, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
      subtitulo: { fontSize: 9, italics: true, alignment: 'center', margin: [0, 0, 0, 16] },
      secao: { fontSize: 12, bold: true, margin: [0, 14, 0, 8] },
      thCell: { bold: true, fontSize: 9, fillColor: '#f0f0f0' },
    },
    defaultStyle: { fontSize: 10, lineHeight: 1.15 },
  };

  const nomeArquivo = `PTAM_${(imovel.endereco || imovel.bairro || 'imovel').replace(/\s+/g, '_')}.pdf`;
  pdfMake.createPdf(docDefinition).download(nomeArquivo);
}
