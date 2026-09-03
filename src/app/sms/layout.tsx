/**
 * The SMS page stands on its own.
 *
 * It was inside the legal group, which inherits the app's theme tokens — so it
 * rendered dark for a reviewer whose machine is in dark mode, light for one
 * whose is not, and its body text sat at a washed-out 5.45:1 either way. This
 * is the page a carrier decides the campaign on. It should look the same for
 * every one of them and it should not be faint.
 *
 * So the palette here is fixed and explicit rather than tokenised. color-scheme
 * is pinned to light so form controls and scrollbars follow, and nothing on the
 * page reads a variable that the rest of the app can change.
 */
export default function SmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ colorScheme: "light", background: "#f6f7f9", color: "#0f172a" }}
      className="min-h-screen"
    >
      {children}
    </div>
  );
}
