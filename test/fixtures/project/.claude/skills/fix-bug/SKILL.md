---
name: fix-bug
description: Fix a reported bug, reproducing it with a failing test first.
metadata:
  evals:
    criteria:
      - name: used-read
        assertion: The session read at least one source file before editing.
        grader: tool-usage
        options:
          tool: Read
          expect: used
      - name: forbidden-tool
        assertion: The session never ran shell commands; this skill is edit-only.
        grader: tool-usage
        options:
          tool: Bash
          expect: not-used
      - Reproduce the bug with a failing test before applying the fix.
---

# Fix Bug

When fixing a bug:

1. Reproduce the bug with a failing test and confirm it fails for the expected reason.
2. Apply the minimal fix.
3. Re-run the test to confirm it passes.
4. Never leave debugging artifacts in the code.
