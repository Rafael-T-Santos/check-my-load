/**
 * Captura e exibição de fotos, num lugar só.
 *
 * Antes cada tela tinha a sua compressão, com valores diferentes (1024, 1200 ou
 * 1280px; qualidade 0.75 ou "até 0.5 MB"), e a que limitava só a largura
 * deixava foto em pé passar de 1700px de altura.
 *
 * O backend recomprime tudo de novo para WebP antes de gravar em disco (ver
 * server/fotos.js). A compressão aqui serve para o envio ser rápido no 4G do
 * pátio; o tamanho final em disco é decidido lá.
 */

/** Lado maior, em pixels. Igual ao FOTO_MAX_LADO do backend. */
export const FOTO_MAX_LADO = 1280;
/** Qualidade do JPEG enviado. Não desça muito: o backend recomprime de novo. */
export const FOTO_QUALIDADE = 0.7;

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    img.src = src;
  });
}

/**
 * Reduz a foto da câmera para no máximo FOTO_MAX_LADO no lado maior e devolve
 * um data URL JPEG, que é o formato que o backend recebe.
 */
export async function comprimirFoto(arquivo: Blob): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await carregarImagem(url);
    const escala = Math.min(1, FOTO_MAX_LADO / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', FOTO_QUALIDADE);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Valor pronto para `<img src>`. O backend devolve a URL do arquivo, ou o
 * base64 antigo enquanto a foto não foi migrada — às vezes sem o prefixo
 * `data:`.
 */
export function fotoSrc(valor: string): string {
  return /^(data:|https?:|blob:|\/)/.test(valor) ? valor : `data:image/jpeg;base64,${valor}`;
}

/**
 * Baixa a foto. Passa por fetch + blob porque o atributo `download` é
 * ignorado em links para outro host — e as fotos vêm do backend, não do
 * mesmo endereço do app. Sem isso o navegador só abriria a imagem.
 */
export async function baixarFoto(valor: string, nomeSemExtensao: string): Promise<void> {
  const resposta = await fetch(fotoSrc(valor));
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const blob = await resposta.blob();
  const extensao = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nomeSemExtensao}.${extensao}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
