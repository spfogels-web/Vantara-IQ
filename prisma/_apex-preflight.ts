/**
 * Step 5 preflight. Read-only: proves where a write would land, writes nothing.
 *
 * Run before the schema push and again before the seed. Also proves the guard
 * can refuse — it is pointed at Fortitude on purpose at the end, and must throw.
 */
import { apexUrl, assertApexTarget, fortitudeFingerprint } from "./_apex-guard";

async function main() {
  console.log("\nStep 5 preflight — where would a write land?\n");

  console.log("Apex, pooled:");
  const pooled = await assertApexTarget(apexUrl("pooled"));
  console.log("\nApex, direct:");
  const direct = await assertApexTarget(apexUrl("direct"));

  console.log("\nFortitude, for the before/after comparison (read-only):");
  const before = await fortitudeFingerprint();
  for (const [k, v] of Object.entries(before)) console.log(`  ${k.padEnd(16)} ${v}`);

  /**
   * The guard has to be able to refuse, or none of the above means anything.
   * Pointed at Fortitude's own string, it must throw rather than return.
   */
  console.log("\nProving the guard refuses Fortitude — on the string:");
  let refusedOnUrl = false;
  try {
    await assertApexTarget(process.env.DATABASE_URL!);
  } catch (e) {
    refusedOnUrl = true;
    console.log(`  PASS  refused — ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }

  /**
   * And on the rows, which is the check that matters.
   *
   * The string comparison above only catches a target that is spelled like
   * Fortitude. The mistake actually worth fearing is a correct-looking string
   * that reaches the wrong database — and the only thing that catches that is
   * asking the rows who they belong to. With the URL checks stood down, the
   * guard must still refuse Fortitude on its data alone.
   */
  console.log("\nProving the guard refuses Fortitude — on the data alone:");
  let refusedOnData = false;
  try {
    await assertApexTarget(process.env.DATABASE_URL!, { onlyData: true });
  } catch (e) {
    refusedOnData = true;
    console.log(`  PASS  refused — ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }

  if (!refusedOnUrl || !refusedOnData) {
    console.error(
      `\n  FAIL: the guard accepted Fortitude (url check ${refusedOnUrl ? "ok" : "FAILED"},` +
        ` data check ${refusedOnData ? "ok" : "FAILED"}). Stopping.`,
    );
    process.exit(1);
  }

  console.log(
    `\nPreflight passed. Apex is ${pooled.host} / ${pooled.database} with ${pooled.tables} tables` +
      ` (direct endpoint agrees: ${direct.tables} tables).`,
  );
  console.log("Nothing was written.");
}

main().catch((e) => {
  console.error("\nPreflight failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
