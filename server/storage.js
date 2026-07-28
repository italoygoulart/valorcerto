/**
 * ARMAZENAMENTO DE ANEXOS — Cloudflare R2 (compatível com S3)
 * ============================================================
 * Fotos do imóvel e documentos (matrícula, IPTU etc.) anexados a uma
 * avaliação. O bucket é PRIVADO — nunca geramos URL pública direta.
 * Toda leitura passa por URL assinada (presigned GET), de validade curta.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const BUCKET = process.env.R2_BUCKET;

export const ANEXO_MIME_PERMITIDOS = {
  'image/jpeg': 'foto',
  'image/png': 'foto',
  'image/webp': 'foto',
  'application/pdf': 'documento',
};

export const ANEXO_TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB por arquivo
export const ANEXO_QTD_MAXIMA_POR_AVALIACAO = 15;

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Envia um arquivo para o bucket, prefixado por avaliação para organização.
 * @returns {string} chave do objeto no bucket
 */
export async function uploadAnexo({ avaliacaoId, buffer, mimeType, nomeOriginal }) {
  const extensao = nomeOriginal?.includes('.') ? nomeOriginal.split('.').pop() : 'bin';
  const chave = `avaliacoes/${avaliacaoId}/${randomUUID()}.${extensao}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: chave,
    Body: buffer,
    ContentType: mimeType,
  }));

  return chave;
}

/** Gera uma URL temporária (10 minutos) para ler um objeto privado. */
export async function urlAssinada(chave, expiraEmSegundos = 600) {
  const comando = new GetObjectCommand({ Bucket: BUCKET, Key: chave });
  return getSignedUrl(s3, comando, { expiresIn: expiraEmSegundos });
}

export async function apagarAnexo(chave) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: chave }));
}

/**
 * Baixa o conteúdo de um objeto direto pelo servidor (sem gerar URL).
 * Usado para reexibir o arquivo através de uma rota própria da API — evita
 * depender de CORS configurado no bucket R2 para o navegador buscar a
 * imagem diretamente (ex.: ao montar o PDF do laudo).
 */
export async function baixarAnexo(chave) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }));
  const bytes = await resp.Body.transformToByteArray();
  return { bytes, contentType: resp.ContentType };
}
