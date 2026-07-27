/**
 * TEXTOS JURÍDICOS OBRIGATÓRIOS
 * =============================
 * Centralizados aqui para garantir consistência em todas as saídas do
 * sistema: tela, PDF exportado e e-mail.
 *
 * NÃO REMOVER de nenhuma saída. Ver item 6.2 do briefing técnico.
 */

// Exibido junto de toda estimativa gratuita (FipeZAP)
export const DISCLAIMER_ESTIMATIVA =
  'Esta estimativa é referencial e foi gerada automaticamente a partir de ' +
  'índices públicos de mercado. Não constitui laudo de avaliação e não ' +
  'possui validade jurídica. Laudo técnico com validade legal deve ser ' +
  'elaborado por profissional credenciado (CRECI/CNAI), conforme a norma ' +
  'ABNT NBR 14653.';

// Exibido na avaliação por comparáveis (área do corretor)
export const DISCLAIMER_COMPARAVEIS =
  'Avaliação referencial por comparação de mercado, gerada a partir de ' +
  'dados públicos de anúncios. Os comparáveis refletem preços de oferta, ' +
  'não de transação efetivada. Este resultado é uma ferramenta de apoio ao ' +
  'trabalho do profissional e não substitui laudo elaborado nos termos da ' +
  'ABNT NBR 14653.';

// Rodapé do PDF exportado
export const DISCLAIMER_PDF =
  'Documento gerado automaticamente para uso profissional interno. ' +
  'Valor referencial, sem validade jurídica. A emissão de laudo de ' +
  'avaliação com fé pública é atribuição privativa de profissional ' +
  'credenciado, observada a ABNT NBR 14653 e a Resolução COFECI vigente.';

// Aceite LGPD — exibido antes da captura de dados do proprietário
export const TEXTO_LGPD =
  'Autorizo o contato por telefone, WhatsApp ou e-mail sobre a avaliação ' +
  'do meu imóvel e o tratamento dos meus dados para essa finalidade, nos ' +
  'termos da Lei nº 13.709/2018 (LGPD). Posso solicitar a exclusão dos ' +
  'meus dados a qualquer momento.';

// Versão do texto de consentimento — incrementar a cada alteração.
// Fica gravado junto do aceite para fins de auditoria.
export const VERSAO_LGPD = '1.0';

// Aviso quando o bairro não está no mapeamento
export const AVISO_FALLBACK =
  'O bairro informado ainda não possui índice específico no sistema. ' +
  'A estimativa usou a referência da região central, o que amplia a ' +
  'margem de erro.';
