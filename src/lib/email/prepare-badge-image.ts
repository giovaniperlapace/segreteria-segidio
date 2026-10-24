const MAX_UPLOAD = 4 * 1024 * 1024;

// Vercel rejects large bodies before the server action can validate the file.
// Use the same resized file for previews, validation and batch preparation.
export async function prepareBadgeImage(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD) return file;
  if (file.size > 10 * 1024 * 1024) throw new Error("Il JPG supera 10 MB. Riduci le dimensioni del file prima di caricarlo.");
  const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) throw new Error("Carica un’immagine JPG valida.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error("Il badge supera 24 milioni di pixel. Riduci la risoluzione dell’immagine.");
    const scale = Math.min(1, 1600 / bitmap.width, 2400 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Impossibile ridimensionare il badge in questo browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size > MAX_UPLOAD) throw new Error("Il JPG è ancora troppo pesante. Riduci le dimensioni del file e riprova.");
    return new File([blob], file.name, { type: "image/jpeg", lastModified: file.lastModified });
  } finally { bitmap.close(); }
}
