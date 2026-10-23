/** A full page load into the invitee's own app (a different origin). */
export function goToSignIn(url: string): void {
  window.location.assign(url);
}
