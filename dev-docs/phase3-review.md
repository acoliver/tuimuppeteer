# Phase 3 Review: Tmux Backend Implementation + Tests

**Date:** 2025-12-19  
**Status:** [CRITICAL] **REQUIRES CORRECTIONS**

---

## Summary

Phase 3 implementation (tmux backend) has been reviewed. The code has **18 ESLint errors** and **1 critical test failure**. TypeScript type checking passes. The implementation requires significant corrections before approval.

---

## Files Reviewed

### Core Implementation
- [CRITICAL] `src/backend/tmux.ts` - Tmux backend with 18 lint errors

### Tests
- [CRITICAL] `test/backend/tmux.test.ts` - Test fails with session name mismatch
- [OK] `test/harness/echo-app.sh` - Test harness is correct

---

## Critical Issues Found

### 1. [CRITICAL] Test Failure - Session Name Timing Bug
**File:** `src/backend/tmux.ts` (affects `test/backend/tmux.test.ts`)

**Problem:**
Test fails with error: `can't find pane: tuimuppeteer_test_19b37aeb591`

**Root Cause:**
The session name uses `Date.now().toString(16)` which generates a timestamp, but the session name is truncated somewhere in the system. The test shows the session name missing the last digit:
- Expected pattern: `tuimuppeteer_test_19b37aeb591X` (where X is truncated)
- Actual lookup: `tuimuppeteer_test_19b37aeb591`

**Additional Issues:**
1. There's a race condition - `sendLine()` is called immediately after `launch()` without waiting for the session to fully initialize
2. No delay between `sendLine()` calls allows the application to process input
3. The test calls `captureScreen()` immediately after sending "quit" without waiting for the application to exit or render output

**Fix Required:**
1. Add a small delay after `launch()` to allow tmux session to stabilize
2. Add delays between `sendLine()` calls to allow the application to process and render
3. Consider adding a `waitForText()` or `waitForOutput()` method to poll for expected content
4. Alternative: Use a more deterministic session naming scheme (UUID, counter, etc.)

**Test Stability Impact:** CRITICAL - test is not deterministic

---

### 2. [CRITICAL] ESLint Errors (18 total)

#### 2.1. Methods marked `async` but have no `await` (7 errors)
**Files:** `src/backend/tmux.ts`

**Locations:**
- Line 8: `async launch()` - no await expression
- Line 39: `async isRunning()` - no await expression  
- Line 48: `async sendKeys()` - no await expression
- Line 55: `async sendLine()` - no await expression
- Line 61: `async paste()` - no await expression
- Line 67: `async resize()` - no await expression
- Line 80: `async captureScreen()` - no await expression
- Line 85: `async captureScrollback()` - no await expression

**Problem:**
Methods are declared `async` to match a backend interface but don't use `await`, which is misleading and adds unnecessary overhead.

**Fix Options:**
1. **Preferred:** If these methods are implementing an interface that requires `async`, wrap the synchronous calls in `Promise.resolve()` to satisfy the contract without changing the interface
2. **Alternative:** Add a comment explaining why async is needed (interface compliance)
3. **Not recommended:** Remove `async` (would break interface contract)

**Example Fix:**
```typescript
// Current
async captureScreen(): Promise<string> {
  this.ensureSession();
  return this.runTmux(['capture-pane', '-p', '-t', this.sessionName!]);
}

// Fix option 1 (preferred for sync operations that must be async)
captureScreen(): Promise<string> {
  this.ensureSession();
  const result = this.runTmux(['capture-pane', '-p', '-t', this.sessionName!]);
  return Promise.resolve(result);
}

// Fix option 2 (if interface requires async signature)
// eslint-disable-next-line @typescript-eslint/require-await
async captureScreen(): Promise<string> {
  this.ensureSession();
  return this.runTmux(['capture-pane', '-p', '-t', this.sessionName!]);
}
```

**Impact:** Medium - affects API consistency and performance

---

#### 2.2. Type Assertion Style (7 errors)
**Files:** `src/backend/tmux.ts`

**Locations:**
- Line 51: `this.sessionName as string` should be `this.sessionName!`
- Line 57: `this.sessionName as string` should be `this.sessionName!`
- Line 58: `this.sessionName as string` should be `this.sessionName!`
- Line 64: `this.sessionName as string` should be `this.sessionName!`
- Line 72: `this.sessionName as string` should be `this.sessionName!`
- Line 82: `this.sessionName as string` should be `this.sessionName!`
- Line 91: `this.sessionName as string` should be `this.sessionName!`

**Problem:**
Code uses `as string` casting when it should use non-null assertion `!` operator.

**Fix:**
```typescript
// Before
this.runTmux(['send-keys', '-t', this.sessionName as string, key]);

// After
this.runTmux(['send-keys', '-t', this.sessionName!, key]);
```

**Impact:** Low - style issue, no functional change

---

#### 2.3. Unnecessary Conditional Checks (2 errors)
**Files:** `src/backend/tmux.ts`

**Locations:**
- Line 128: `result.stderr ?? ''` - stderr is always defined in SpawnSyncReturns
- Line 131: `result.stdout ?? ''` - stdout is always defined in SpawnSyncReturns

**Problem:**
The `spawnSync` with `encoding: 'utf8'` always returns defined `stdout` and `stderr` strings (they may be empty, but never null/undefined).

**Fix:**
```typescript
// Before
const message = (result.stderr ?? '').toString().trim();
return (result.stdout ?? '').toString();

// After  
const message = result.stderr.trim();
return result.stdout;
```

**Note:** The `.toString()` call is also unnecessary since encoding is set to 'utf8'.

**Impact:** Low - redundant code

---

#### 2.4. Security Warning - PATH Injection (1 error)
**Files:** `src/backend/tmux.ts`

**Location:** Line 121: `spawnSync('tmux', args, ...)`

**Problem:**
SonarJS warns that executing commands from PATH can be a security risk if an attacker can modify the PATH variable.

**Assessment:**
This is a **false positive** for this use case:
- `tmux` is a required system dependency
- The tool is designed to be run in controlled environments (test harnesses)
- No user-supplied input goes into the command name itself (only args)
- Using absolute path would break portability (tmux location varies by system)

**Fix:**
Add an ESLint disable comment with explanation:
```typescript
// tmux is a required system dependency - PATH usage is intentional
// eslint-disable-next-line sonarjs/no-os-command-from-path
const result = spawnSync('tmux', args, {
  encoding: 'utf8',
});
```

**Impact:** Low - security false positive, but should be documented

---

## Code Quality Review

### `src/backend/tmux.ts`

#### Architecture
**Strengths:**
- [OK] Clean class structure with clear responsibility
- [OK] Private methods (`ensureSession`, `runTmux`) properly encapsulated
- [OK] Session lifecycle managed explicitly (launch → operations → waitForExit)
- [OK] Synchronous implementation is appropriate (tmux CLI is fast)

**Concerns:**
- [MEDIUM] No cleanup method to kill/destroy sessions on error or test completion
- [MEDIUM] No timeout on individual tmux operations (hangs if tmux blocks)
- [LOW] Session name collision possible (timestamp-based naming)

#### Error Handling
**Strengths:**
- [OK] Throws clear errors from `ensureSession()`
- [OK] Propagates tmux stderr messages in exceptions
- [OK] Validates PID is a number after parsing

**Concerns:**
- [CRITICAL] No cleanup on error in `launch()` - session may leak if PID read fails
- [MEDIUM] `isRunning()` swallows all exceptions, not just ESRCH
- [LOW] Generic error message "tmux command failed" when stderr is empty

**Fix Needed:**
```typescript
async launch(command: string, args: string[], cwd?: string): Promise<{ pid: number }> {
  const sessionName = `${this.sessionPrefix}_${Date.now().toString(16)}`;
  this.sessionName = sessionName;

  try {
    const tmuxArgs = [
      'new-session',
      '-d',
      '-s',
      sessionName,
      ...(cwd ? ['-c', cwd] : []),
      command,
      ...args,
    ];
    this.runTmux(tmuxArgs);

    const output = this.runTmux([
      'display-message',
      '-p',
      '-t',
      `${sessionName}:0.0`,
      '#{pane_pid}',
    ]).trim();

    const pid = Number(output);
    if (!Number.isFinite(pid)) {
      throw new Error('Failed to read tmux pane PID');
    }

    return { pid };
  } catch (error) {
    // Clean up session on error
    try {
      this.runTmux(['kill-session', '-t', sessionName]);
    } catch {
      // Ignore cleanup errors
    }
    this.sessionName = null;
    throw error;
  }
}
```

#### Session Management
**Current Implementation:**
```typescript
private sessionName: string | null = null;

private ensureSession(): void {
  if (!this.sessionName) {
    throw new Error('tmux session not started');
  }
}
```

**Concerns:**
- [MEDIUM] No method to explicitly destroy/cleanup session
- [MEDIUM] No way to check if session is still alive before operations
- [LOW] Session name stored as nullable but always used as non-null after check

**Missing Methods:**
```typescript
async destroy(): Promise<void> {
  if (this.sessionName) {
    try {
      this.runTmux(['kill-session', '-t', this.sessionName]);
    } catch {
      // Session may already be dead
    } finally {
      this.sessionName = null;
    }
  }
}

async isSessionAlive(): Promise<boolean> {
  if (!this.sessionName) return false;
  try {
    this.runTmux(['has-session', '-t', this.sessionName]);
    return true;
  } catch {
    return false;
  }
}
```

#### Input Methods
**Review:**
- [OK] `sendKeys()` - loops through keys array correctly
- [OK] `sendLine()` - uses `-l` flag for literal text + Enter
- [OK] `paste()` - uses tmux paste buffer (proper approach)

**Edge Cases Not Handled:**
- What if `keys` array is empty? (harmless but wasteful)
- What if `text` contains null bytes? (tmux may truncate)
- No validation on key names (e.g., user passes invalid key like "BadKey")

#### Output Methods  
**Review:**
- [OK] `captureScreen()` - uses `-p` to print to stdout
- [OK] `captureScrollback()` - uses `-S -N` to capture N lines back
- [OK] `resize()` - uses `-x` and `-y` flags correctly

**Edge Cases Not Handled:**
- `captureScrollback(lines)` - what if lines is 0? negative?
- `resize(cols, rows)` - what if cols/rows are 0? negative? too large?

#### Process Control
**`isRunning()` Review:**
```typescript
async isRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

**Concerns:**
- [LOW] Catches all exceptions, not just ESRCH (process not found)
- [LOW] Could throw EPERM (permission denied) but returns false
- [INFO] This is a common pattern, but technically incorrect

**Better Implementation:**
```typescript
async isRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    // Re-throw permission errors or other unexpected errors
    throw error;
  }
}
```

**`waitForExit()` Review:**
```typescript
async waitForExit(timeoutMs: number): Promise<void> {
  this.ensureSession();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const output = this.runTmux([
      'list-panes',
      '-t',
      `${this.sessionName}:0`,
      '-F',
      '#{pane_dead}',
    ]).trim();
    if (output.split('\\n')[0]?.trim() === '1') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for tmux pane to exit');
}
```

**Concerns:**
- [LOW] Uses `split('\\n')[0]?.trim()` - safer to just check `output.trim() === '1'`
- [LOW] Fixed 200ms polling interval - could be configurable
- [INFO] Polling is acceptable for this use case

---

### `test/backend/tmux.test.ts`

#### Test Structure
**Strengths:**
- [OK] Uses real test harness (`echo-app.sh`)
- [OK] Tests full workflow: launch → input → capture → wait
- [OK] Checks process is running after launch
- [OK] Verifies output contains expected text

**Critical Issues:**
- [CRITICAL] Test fails due to race condition (no delays)
- [CRITICAL] Missing cleanup - sessions leak on test failure
- [MEDIUM] Single test - insufficient coverage
- [MEDIUM] No error case testing
- [LOW] Hardcoded session prefix doesn't ensure uniqueness

#### Missing Test Coverage
**Not Tested:**
- Error handling (invalid command, missing session, etc.)
- `sendKeys()` method
- `paste()` method
- `resize()` method  
- `captureScrollback()` method
- `isRunning()` with dead process
- `waitForExit()` timeout
- Session cleanup/destroy
- Multiple backend instances
- Concurrent operations

**Recommended Additional Tests:**
```typescript
it('throws when operations called before launch', async () => {
  const backend = new TmuxBackend('test');
  await expect(() => backend.sendLine('test')).rejects.toThrow('tmux session not started');
});

it('handles command that exits immediately', async () => {
  const backend = new TmuxBackend('test');
  await backend.launch('echo', ['hello'], process.cwd());
  await backend.waitForExit(2000);
  // Session should be dead
});

it('sendKeys sends multiple keys correctly', async () => {
  // Test with arrow keys, special keys, etc.
});

it('paste inserts multi-line text', async () => {
  // Test paste buffer functionality
});

it('resize changes terminal dimensions', async () => {
  // Launch, resize, verify with tput or similar
});

it('captureScrollback retrieves history', async () => {
  // Send many lines, capture scrollback, verify
});

it('waitForExit throws on timeout', async () => {
  const backend = new TmuxBackend('test');
  await backend.launch('sleep', ['10'], process.cwd());
  await expect(() => backend.waitForExit(500)).rejects.toThrow('Timed out');
  // Clean up the sleep process
});

it('cleans up sessions on error', async () => {
  // Test that failed launch doesn't leak sessions
});
```

#### Test Harness
**`test/harness/echo-app.sh` Review:**
- [OK] Simple, deterministic behavior
- [OK] Prints "Ready>" on start
- [OK] Echoes input with "Echo: " prefix
- [OK] Exits cleanly on "quit"
- [OK] Proper bash best practices (`set -euo pipefail`)

**Adequacy:** Good for basic testing, but may want additional harnesses:
- Harness that produces lots of output (scrollback testing)
- Harness that uses ANSI colors/styles (future style testing)
- Harness that prompts for input without newline
- Harness that exits with non-zero status

---

## Type Safety

**Type Check:** [OK] Passes `tsc --noEmit`

**Type Flow Analysis:**
- `sessionName: string | null` - correctly nullable
- `ensureSession()` - narrows type from `string | null` to non-null
- All public methods return `Promise<T>` for interface compatibility
- `runTmux()` returns `string` from stdout

**Type Issues:**
- [OK] No type safety issues
- [INFO] Could use branded types for session names, PIDs for extra safety

---

## Integration & Dependencies

**Dependencies:**
- [OK] Uses `node:child_process` (built-in)
- [OK] No external dependencies (good for portability)

**System Dependencies:**
- [CRITICAL] Requires `tmux` installed - not checked or documented
- [INFO] Should document tmux version requirements (if any)
- [INFO] Should provide clear error if tmux not found

**Integration Points:**
- Will be used by higher-level automation framework
- Likely implements a `Backend` interface (not visible in this review)
- Test harness uses bash scripts (requires bash)

---

## Performance & Resource Usage

**Resource Concerns:**
- [MEDIUM] Sessions not cleaned up - leak on error or uncaught exceptions
- [LOW] Each backend instance creates new session (not pooled)
- [LOW] Polling in `waitForExit()` could be more efficient

**Performance Notes:**
- Synchronous `spawnSync` is fast for tmux (CLI is quick)
- No buffering issues - tmux handles its own output buffering
- 200ms polling in `waitForExit()` is reasonable

---

## Security Review

**Concerns:**
- [LOW] No input sanitization on command/args passed to tmux
  - Risk: Low - only used in test environment
  - Impact: Could break tmux commands with special characters
- [LOW] Session names based on timestamp could collide
  - Risk: Low - millisecond precision usually sufficient
  - Impact: Session collision would cause test failures
- [INFO] SonarJS flags PATH usage (acceptable in this context)

**Recommendations:**
- Add input validation for method parameters (cols/rows/lines > 0)
- Consider escaping or validating special characters in text
- Document that this tool is for testing, not production use

---

## Documentation Review

**Current Documentation:**
- [MISSING] No JSDoc comments on public methods
- [MISSING] No README explaining tmux backend usage
- [MISSING] No docs on system requirements (tmux version)
- [MISSING] No examples of usage

**Required Documentation:**
```typescript
/**
 * TmuxBackend provides a tmux-based terminal automation interface.
 * 
 * Requires tmux to be installed and available in PATH.
 * 
 * @example
 * const backend = new TmuxBackend('my-session');
 * const { pid } = await backend.launch('bash', [], '/tmp');
 * await backend.sendLine('echo hello');
 * const screen = await backend.captureScreen();
 * await backend.waitForExit(5000);
 */
class TmuxBackend {
  /**
   * Launch a new program in a detached tmux session.
   * 
   * @param command - Program to execute
   * @param args - Arguments to pass to program
   * @param cwd - Working directory (optional)
   * @returns Promise resolving to { pid } of spawned process
   * @throws Error if tmux session creation fails
   */
  async launch(command: string, args: string[], cwd?: string): Promise<{ pid: number }> {
    // ...
  }
  
  // ... document other methods
}
```

---

## Comparison to Project Plan

**From `dev-docs/plan.md` Phase 4:**
> Add tmux backend for:
> - debugging sessions
> - copy-mode scrolling tests
> Keep behavior consistent with PTY snapshot interface (best-effort).

**Review:**
- [PARTIAL] Basic tmux operations implemented
- [MISSING] No debugging features mentioned (attach to session, etc.)
- [MISSING] No copy-mode support
- [UNKNOWN] No PTY backend visible to compare consistency
- [INFO] Appears to be early implementation, not feature-complete

---

## Validation Results

```bash
[FAIL] Lint:      18 errors
   - 7× async methods with no await
   - 7× type assertion style (as string → !)
   - 2× unnecessary conditionals
   - 1× PATH security warning
   - 1× strict-boolean-expressions (in test file)

[OK]   TypeCheck: PASS

[FAIL] Tests:     1 test FAILED
   - Test fails with "can't find pane" error
   - Root cause: race condition, no delays between operations
```

---

## Required Corrections

### Priority 1 - CRITICAL (Must Fix)
1. **Fix test race condition**
   - Add delays after `launch()` and between `sendLine()` calls
   - OR implement `waitForOutput()` method to poll for expected text
   - Ensure test is deterministic and repeatable

2. **Add session cleanup**
   - Add `destroy()` method to kill tmux session
   - Clean up session in `launch()` error handler
   - Add test cleanup (afterEach hook or try/finally)

3. **Fix async method lint errors**
   - Either wrap in `Promise.resolve()` or add eslint-disable comments
   - Decide on approach and apply consistently

### Priority 2 - HIGH (Should Fix)
4. **Fix type assertion style**
   - Replace all `as string` with `!` operator (7 locations)

5. **Fix unnecessary conditionals**
   - Remove `?? ''` on stderr/stdout (2 locations)
   - Remove unnecessary `.toString()` calls

6. **Add session cleanup to tests**
   - Use `afterEach` hook to kill test sessions
   - Prevent session leaks on test failure

### Priority 3 - MEDIUM (Should Add)
7. **Add error handling tests**
   - Test operations before launch
   - Test with invalid commands
   - Test timeout scenarios

8. **Add missing method tests**
   - Test `sendKeys()`
   - Test `paste()`
   - Test `resize()`
   - Test `captureScrollback()`

9. **Improve error handling in `isRunning()`**
   - Only catch ESRCH, re-throw other errors

10. **Add cleanup method**
    ```typescript
    async destroy(): Promise<void>
    ```

### Priority 4 - LOW (Nice to Have)
11. **Add JSDoc documentation**
    - Document all public methods
    - Add usage examples
    - Document system requirements

12. **Add input validation**
    - Validate cols/rows/lines are positive
    - Consider validating key names

13. **Add PATH warning suppression**
    - Add eslint-disable comment with explanation

14. **Create README for backend**
    - Document tmux requirements
    - Provide usage examples
    - Explain design decisions

---

## Test Stability Assessment

**Current State:** [CRITICAL] Test is **not stable**

**Reasons:**
1. Race condition between `launch()` and subsequent operations
2. No waiting for application to process input and render output
3. Session name timing issue (possible truncation/collision)
4. No session cleanup on failure (accumulates dead sessions)

**To Achieve Stability:**
1. Add delays or polling between operations
2. Implement `waitForOutput(text, timeout)` helper
3. Add session cleanup in `afterEach()`
4. Consider adding retry logic for flaky tmux operations
5. Add timestamp/uniqueness to session names

**Estimated Stability After Fixes:** MEDIUM-HIGH
- Tmux itself is deterministic
- Test harness is simple and reliable
- Main issue is timing/synchronization

---

## Recommendations for Phase 4

### Immediate Actions
1. Fix all Priority 1 (CRITICAL) issues
2. Fix all Priority 2 (HIGH) issues
3. Verify tests pass consistently (run 10+ times)

### Before Phase 5
4. Add Priority 3 (MEDIUM) test coverage
5. Add Priority 4 (LOW) documentation
6. Review against PTY backend for consistency (when available)

### Design Improvements
- Consider adding a `TmuxSession` class to encapsulate session lifecycle
- Add configuration for polling intervals and timeouts
- Consider adding debug logging (when tmux command fails, log full command)
- Add builder pattern for complex launch configurations

### Testing Strategy
- Run tests in parallel to catch race conditions
- Add stress test (create/destroy many sessions rapidly)
- Test on different tmux versions (document compatibility)
- Add integration test with real TUI applications

---

## Final Verdict

**Phase 3 Status:** [CRITICAL] **NOT APPROVED - REQUIRES CORRECTIONS**

The implementation:
- [ERROR] Has 18 ESLint errors that must be fixed
- [ERROR] Has 1 critical test failure due to race condition
- [ERROR] Missing essential session cleanup functionality
- [ERROR] Insufficient test coverage for a backend implementation
- [OK] Passes TypeScript type checking
- [OK] Has clean architecture and good separation of concerns
- [OK] Uses appropriate synchronous approach for tmux CLI

**Blocking Issues:**
1. Test must pass reliably before approval
2. ESLint errors must be resolved
3. Session cleanup must be added to prevent resource leaks

**Ready for:** Re-review after corrections applied

**Estimated Effort to Fix:**
- Priority 1 fixes: 2-3 hours
- Priority 2 fixes: 1-2 hours
- Priority 3 additions: 3-4 hours
- Priority 4 documentation: 2-3 hours
- **Total:** 8-12 hours for full compliance

---

## Appendix: Test Failure Details

### Full Test Output
```
 test/backend/tmux.test.ts (1 test | 1 failed) 44ms
     × launches, sends input, captures, and exits 43ms

FAIL  test/backend/tmux.test.ts > tmux backend > launches, sends input, captures, and exits
Error: can't find pane: tuimuppeteer_test_19b37aeb591
  TmuxBackend.runTmux src/backend/tmux.ts:129:13
  TmuxBackend.captureScreen src/backend/tmux.ts:82:17
  test/backend/tmux.test.ts:22:34
```

### Investigation Notes
1. Session was created: `tuimuppeteer_test_19b37aeb591X` (full name unknown)
2. Lookup fails: can't find `tuimuppeteer_test_19b37aeb591`
3. Possible causes:
   - Session name truncation
   - Session hasn't fully initialized
   - Race between sendLine and captureScreen
   - Application hasn't processed input yet

### Debugging Steps Needed
1. Add logging to see full session name after creation
2. Add delay after launch() to allow session to stabilize
3. List sessions before captureScreen to verify it exists
4. Check tmux version and configuration

### Temporary Workaround for Testing
```typescript
it('launches, sends input, captures, and exits', async () => {
  const backend = new TmuxBackend('tuimuppeteer_test');
  const { pid } = await backend.launch(harnessPath, [], process.cwd());

  expect(await backend.isRunning(pid)).toBe(true);

  // Add delay to let session initialize
  await new Promise((resolve) => setTimeout(resolve, 100));

  await backend.sendLine('hello');
  
  // Add delay to let app process input
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  await backend.sendLine('quit');
  
  // Add delay to let app render output before capture
  await new Promise((resolve) => setTimeout(resolve, 100));

  const screen = await backend.captureScreen();
  expect(screen).toContain('Ready>');
  expect(screen).toContain('Echo: hello');

  await backend.waitForExit(2000);
});
```

This is a temporary workaround - proper fix should use polling/waiting instead of fixed delays.
