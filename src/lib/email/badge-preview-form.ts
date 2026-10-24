// Keep preview uploads independent from the email form's attachments and React metadata.
export function badgePreviewForm(source: FormData, realNames: boolean, layout: unknown) {
  const file = source.get("badgeImage");
  if (!(file instanceof File) || !file.size) throw new Error("Carica un’immagine JPG del badge.");
  if (file.size > 4 * 1024 * 1024) throw new Error("Il JPG del badge supera 4 MB. Riduci le dimensioni del file e caricalo di nuovo.");
  const data = new FormData();
  data.set("badgeImage", file);
  data.set("badgeEnabled", "on");
  data.set("badgeLayout", JSON.stringify(layout));
  if (realNames) {
    for (const key of ["eventId", "targetKind", "selectedInvitationIds", "emailPartFilter", "emailPartIds", "selectedListPartId"]) {
      for (const value of source.getAll(key)) if (typeof value === "string") data.append(key, value);
    }
  }
  return data;
}
