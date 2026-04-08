/**
 * Test runner that executes test batches in isolation and prints a combined summary.
 *
 * ai-providers.test.ts uses Bun's mock.module() on config-manager, which permanently
 * replaces the module for the entire process. Running it in a separate batch prevents
 * it from polluting other test files.
 */

// Bun's mock.module() permanently replaces a module for the entire process.
// Tests that mock internal modules must be isolated from tests that need the
// real version. Group by which internal modules they mock:
const batches = [
  // Batch 1: mocks config-manager
  ['tests/ai-providers.test.ts', 'tests/auth.test.ts', 'tests/github.test.ts'],
  // Batch 2: mocks secure-storage
  ['tests/config-manager.test.ts'],
  // Batch 3: mocks file-search
  ['tests/fuzzy-picker.test.ts'],
  // Batch 4: no internal module mocks (safe to run together)
  [
    'tests/blame.test.ts',
    'tests/cli.test.ts',
    'tests/configs.test.ts',
    'tests/context-builder.test.ts',
    'tests/errors.test.ts',
    'tests/types.test.ts',
    'tests/renderer.test.ts',
    'tests/secure-storage.test.ts',
    'tests/file-search.test.ts',
  ],
];

let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;
let totalFiles = 0;
let failed = false;

for (const files of batches) {
  const proc = Bun.spawn(['bun', 'test', ...files], {
    stdout: 'inherit',
    stderr: 'pipe',
    env: { ...process.env },
  });

  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;

  // Bun prints test results to stderr
  process.stderr.write(stderr);

  if (code !== 0) failed = true;

  // Parse summary from stderr: " N pass", " N fail", " N skip", "across N file(s)"
  const passMatch = stderr.match(/(\d+) pass/);
  const failMatch = stderr.match(/(\d+) fail/);
  const skipMatch = stderr.match(/(\d+) skip/);
  const filesMatch = stderr.match(/across (\d+) file/);

  if (passMatch) totalPass += parseInt(passMatch[1]);
  if (failMatch) totalFail += parseInt(failMatch[1]);
  if (skipMatch) totalSkip += parseInt(skipMatch[1]);
  if (filesMatch) totalFiles += parseInt(filesMatch[1]);
}

console.log('\n━━━ Total ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip across ${totalFiles} files`);

if (failed) {
  process.exit(1);
}
