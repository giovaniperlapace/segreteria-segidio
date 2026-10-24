export type BadgeAttachment = { file_name: string; content_type: string; content_base64: string; file_size_bytes: number };

export function badgeMailAttachment(value: BadgeAttachment | null | undefined) {
  return value ? [{ filename: value.file_name, contentType: value.content_type, content: Buffer.from(value.content_base64, "base64") }] : [];
}
