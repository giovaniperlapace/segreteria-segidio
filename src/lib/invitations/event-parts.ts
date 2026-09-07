export type EventPart = { id: string; title: string };
export type PartResponse = {
  id: string;
  response: 'no_response' | 'attending' | 'declined' | 'maybe' | 'delegated';
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
};
export const PART_RESPONSE_LABELS = {
  no_response: 'Nessuna risposta', attending: 'Partecipo', declined: 'Non partecipo', maybe: 'Forse', delegated: 'Delego una persona',
};
export function parseEventParts(value: string): EventPart[] {
  const parts: EventPart[] = JSON.parse(value);
  if (!Array.isArray(parts) || parts.length > 5) throw new Error('Inserisci al massimo cinque parti.');
  const ids = new Set<string>();
  const titles = new Set<string>();
  return parts.map((part) => {
    if (typeof part.id !== 'string' || !/^[\w-]{1,64}$/.test(part.id) || ids.has(part.id) || typeof part.title !== 'string' || !part.title.trim() || part.title.trim().length > 200 || titles.has(part.title.trim().toLowerCase())) throw new Error('Ogni parte deve avere un nome diverso, da 1 a 200 caratteri.');
    ids.add(part.id); titles.add(part.title.trim().toLowerCase());
    return { id: part.id, title: part.title.trim() };
  });
}
export function parsePartResponses(value: string, parts: EventPart[], publicResponse = false): PartResponse[] {
  const rows: PartResponse[] = JSON.parse(value);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > parts.length) throw new Error('Seleziona almeno una parte.');
  const ids = new Set<string>();
  return rows.map((row) => {
    if (!parts.some((part) => part.id === row.id) || ids.has(row.id) || !Object.hasOwn(PART_RESPONSE_LABELS, row.response) || (publicResponse && row.response === 'no_response')) throw new Error('Indica una risposta valida per ogni parte invitata.');
    ids.add(row.id);
    if (row.response !== 'delegated') return { id: row.id, response: row.response };
    const firstName = row.firstName?.trim() ?? '', lastName = row.lastName?.trim() ?? '', email = row.email?.trim().toLowerCase() ?? '', role = row.role?.trim() ?? '';
    if (!firstName || !lastName || firstName.length > 200 || lastName.length > 200 || role.length > 200 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indica nome, cognome ed email valida per ogni delegato.');
    return { id: row.id, response: row.response, firstName, lastName, email, role };
  });
}
export function describeParts(parts: EventPart[], responses: PartResponse[]) {
  return responses.map((row) => `${parts.find((part) => part.id === row.id)?.title ?? row.id}: ${PART_RESPONSE_LABELS[row.response]}${row.response === 'delegated' ? ` (${row.firstName} ${row.lastName}, ${row.email}${row.role ? `, ${row.role}` : ''})` : ''}`).join('\n');
}

export function emailPartFilterIds(mode: string, selectedIds: string[], parts: EventPart[]) {
  if (!['any', 'all', 'parts'].includes(mode)) throw new Error('Filtro parti non valido.');
  if (mode === 'any') return [];
  if (!parts.length) throw new Error('Questo evento non ha parti.');
  if (mode === 'all') return parts.map(part => part.id);
  const ids = [...new Set(selectedIds)];
  if (!ids.length || ids.some(id => !parts.some(part => part.id === id))) {
    throw new Error('Seleziona almeno una parte valida per il filtro.');
  }
  return ids;
}

export function matchesInvitedParts(responses: Pick<PartResponse, 'id'>[], requiredIds: string[]) {
  return requiredIds.every(id => responses.some(response => response.id === id));
}
