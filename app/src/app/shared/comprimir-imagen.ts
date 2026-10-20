/** Lado mayor máximo de una foto de contrato: se lee bien y pesa ~300-600 KB. */
const LADO_MAXIMO = 1800;
const CALIDAD_JPEG = 0.82;

/**
 * Reduce las fotos del celular (3-8 MB) antes de subirlas, para no llenar el
 * almacenamiento gratuito. Los PDF y los formatos que el navegador no sabe
 * dibujar (ej. HEIC en algunos equipos) se suben tal cual.
 */
export async function prepararArchivo(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/') || archivo.type === 'image/heic' || archivo.type === 'image/heif') {
    return archivo;
  }
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG));
    if (!blob || blob.size >= archivo.size) return archivo;
    const nombre = archivo.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg' });
  } catch {
    return archivo;
  }
}
