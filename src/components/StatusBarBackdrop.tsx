/**
 * Solid black strip behind the iOS status bar / Dynamic Island.
 *
 * With `viewport-fit=cover` + `black-translucent` (index.html), the home-
 * screen PWA draws under the status bar, and iOS always renders the status
 * bar text white in that mode — unreadable over the light theme, and the
 * frosted header made the island area grey in dark. Its height is the raw
 * top safe-area inset, so it is 0 (invisible) in Safari's browser UI and on
 * desktop, and only shows in the standalone PWA.
 */
export default function StatusBarBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-black"
    />
  );
}
