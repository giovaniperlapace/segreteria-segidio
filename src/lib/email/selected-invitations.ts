/** Selected rows remain eligible for follow-up emails after any response. */
export function canEmailSelectedInvitation(invitation: { invitation_status: string }) {
  return invitation.invitation_status === "selected" || invitation.invitation_status === "invited";
}
