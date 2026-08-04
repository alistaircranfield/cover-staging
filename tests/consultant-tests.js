/*
 * Moved. This suite is now tests/cover-tests.js.
 *
 * Renamed on 4 Aug 2026 with the split. "Consultant tests" was ambiguous in exactly the way the
 * split exists to end: it could have meant Cover — which consultant covers which pod — or the
 * Consultant Rota, which is job plans, tariffs and sessions and has not been built yet. This
 * suite has only ever tested the first.
 *
 * Left here rather than deleted so that a stale CI step or a habit of typing the old name fails
 * with a sentence instead of "file not found".
 *
 *   node tests/cover-tests.js
 */
console.error(
  "consultant-tests.js has been renamed to cover-tests.js.\n" +
  "\n" +
  "Cover is the pod cover allocation; the Consultant Rota is a separate, unbuilt page.\n" +
  "This suite tests Cover.\n" +
  "\n" +
  "    node tests/cover-tests.js\n"
);
process.exit(1);
