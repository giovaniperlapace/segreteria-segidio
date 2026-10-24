import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";

export type BadgeLayout = { firstX: number; firstY: number; lastX: number; lastY: number; fontSize: number };
import type { BadgeAttachment } from "./badge-attachment";
export { badgeMailAttachment, type BadgeAttachment } from "./badge-attachment";
export const DEFAULT_BADGE_LAYOUT: BadgeLayout = { firstX: 50, firstY: 87, lastX: 50, lastY: 93, fontSize: 5 };

export async function readBadge(form: FormData) {
  const file = form.get("badgeImage");
  if (!(file instanceof File) || !file.size) {
    if (form.get("badgeEnabled") === "on") throw new Error("Badge: carica il JPG e attendi la fine dell’anteprima.");
    return null;
  }
  if (file.size > 4 * 1024 * 1024) throw new Error("Badge: il JPG può pesare al massimo 4 MB.");
  let layout: BadgeLayout;
  try { layout = JSON.parse(String(form.get("badgeLayout"))); } catch { throw new Error("Badge: posizione non valida."); }
  for (const key of Object.keys(DEFAULT_BADGE_LAYOUT) as Array<keyof BadgeLayout>) {
    const value = layout?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < (key === "fontSize" ? 1 : 5) || value > (key === "fontSize" ? 12 : 95)) throw new Error("Badge: posizione o dimensione non valida.");
  }
  const source = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(source, { limitInputPixels: 24_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 24_000_000) throw new Error("Badge: immagine troppo grande (massimo 24 milioni di pixel).");
  if (metadata.format !== "jpeg") throw new Error("Badge: carica un’immagine JPG valida.");
  const image = await sharp(source).rotate().resize({ width: 1600, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer();
  return { image, layout };
}

export function badgeProof(image: Buffer, layout: BadgeLayout, audience: unknown) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Badge: configurazione server mancante.");
  return createHmac("sha256", key).update(image).update(JSON.stringify(layout)).update(JSON.stringify(audience)).digest("hex");
}
export function verifyBadgeProof(actual: string, expected: string) {
  return /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

const escapeMarkup = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
export async function renderBadge(image: Buffer, layout: BadgeLayout, firstName: string, lastName: string): Promise<BadgeAttachment> {
  if (!firstName.trim() || !lastName.trim()) throw new Error("Badge: nome o cognome mancante. Completa i dati del destinatario prima di preparare l’invio.");
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const overlays: OverlayOptions[] = [];
  for (const [name, x, y] of [[firstName, layout.firstX, layout.firstY], [lastName, layout.lastX, layout.lastY]] as const) {
    const normalized = name.replace(/\s+/g, " ").trim();
    if (normalized.length > 250) throw new Error("Badge: nome troppo lungo.");
    const label = await sharp({ text: { text: escapeMarkup(normalized), font: `Noto Sans ${Math.round(width * layout.fontSize / 100)}`, fontfile: path.join(process.cwd(), "src/lib/email/fonts/NotoSans-Regular.ttf"), rgba: true, dpi: 72 } }).png().toBuffer();
    const maxWidth = Math.floor(width * Math.min(x, 100 - x) / 100 * 2 - 8);
    const maxHeight = Math.floor(height * Math.min(y, 100 - y) / 100 * 2 - 8);
    const { data, info } = await sharp(label).resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    overlays.push({ input: data, left: Math.round(width * x / 100 - info.width / 2), top: Math.round(height * y / 100 - info.height / 2) });
  }
  const content = await sharp(image).composite(overlays).jpeg({ quality: 94 }).toBuffer();
  return { file_name: "badge-personalizzato.jpg", content_type: "image/jpeg", content_base64: content.toString("base64"), file_size_bytes: content.length };
}
