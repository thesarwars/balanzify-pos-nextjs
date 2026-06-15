// lib/nav-guard.ts — block in-app (SPA) navigation when a screen has unsaved work.
// Next.js' client router has no built-in "are you sure?" hook, so a screen flags
// that it's dirty; the shell consults that flag before navigating and, when set,
// shows its own themed confirm dialog instead of the browser's native confirm().
// (The `beforeunload` event still handles hard reloads / tab close.)

let blocked = false;
let message = 'You have unsaved changes on this page. Leave and discard them?';
let title = 'Discard changes?';

export function setNavBlock(on: boolean, opts?: { message?: string; title?: string }) {
  blocked = on;
  if (opts?.message) message = opts.message;
  if (opts?.title) title = opts.title;
}
export function isNavBlocked(): boolean { return blocked; }
export function navBlockMessage(): string { return message; }
export function navBlockTitle(): string { return title; }
