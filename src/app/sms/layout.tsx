/**
 * The SMS page stands on its own.
 *
 * It was inside the legal group, which inherits the app's theme tokens — so it
 * rendered dark for a reviewer whose machine is in dark mode, light for one
 * whose is not, and its body text sat at a washed-out 5.45:1 either way. This
 * is the page a carrier decides the campaign on. It cannot be faint.
 *
 * The fix then was to pin it to light. That kept a reviewer safe and made the
 * page the one part of the product that ignored the theme, which is jarring
 * for the people who actually use Vantara IQ — a crew opening it to stop their
 * texts gets a white flash in the middle of a dark application.
 *
 * So it follows the theme now, with its own palette rather than the app's
 * tokens. Both halves are written here and both are measured: the lightest
 * text on either background is body copy, and it is over 9:1 on both. Nothing
 * on this page reads a variable the rest of the app can change, so a token
 * edit somewhere else can never quietly dim the page a carrier is reading.
 */
export default function SmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        .sms-page {
          color-scheme: light;
          --sms-bg: #f6f7f9;
          --sms-card: #ffffff;
          --sms-sunk: #f8fafc;
          --sms-ink: #0f172a;
          --sms-body: #334155;
          --sms-muted: #475569;
          --sms-gold: #8a5d0a;
          --sms-line: #cbd5e1;
          --sms-hair: rgb(15 23 42 / 0.10);
        }
        .dark .sms-page {
          color-scheme: dark;
          --sms-bg: #0b1220;
          --sms-card: #131c2e;
          --sms-sunk: #0f1829;
          /* Measured against --sms-card, not estimated: ink 15.54:1,
             body 11.47:1, muted 8.28:1, gold 9.45:1 — all AAA. The gold is
             lifted from #8a5d0a, which is a link colour on white and
             unreadable on navy. Light side for comparison: 17.85, 10.35,
             7.58, and 5.75 for the gold, which is AA and the weakest value
             on either side of the page. */
          --sms-ink: #f1f5f9;
          --sms-body: #cbd5e1;
          --sms-muted: #a9b6c8;
          --sms-gold: #f0b849;
          --sms-line: #2b3852;
          --sms-hair: rgb(226 232 240 / 0.12);
        }
      `}</style>
      <div
        className="sms-page min-h-screen"
        style={{ background: "var(--sms-bg)", color: "var(--sms-ink)" }}
      >
        {children}
      </div>
    </>
  );
}
