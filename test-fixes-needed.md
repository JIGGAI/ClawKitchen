# Test Fixes Needed

## Issue
Multiple pre-existing test failures in ClawKitchen test suite (50 failed tests on main branch).
These failures prevent legitimate feature commits from passing the pre-commit hook.

## Affected Areas
- `src/app/api/scaffold/__tests__/helpers.test.ts` - Mock configuration issues
- Various other test files with similar mocking/setup problems

## Sample Errors
```
FAIL src/app/api/scaffold/__tests__/helpers.test.ts > scaffold helpers > validateTeamId > returns 409 when team workspace exists
TypeError: Cannot read properties of undefined (reading 'ok')

FAIL src/app/api/scaffold/__tests__/helpers.test.ts > scaffold helpers > persistTeamProvenance > writes team.json when workspace configured  
AssertionError: expected "vi.fn()" to be called at least once
```

## Impact
- Blocks all commits requiring test passes
- Forces developers to bypass pre-commit hooks
- Reduces confidence in test suite reliability

## Recommendation
- Audit and fix all failing tests
- Consider temporarily disabling problematic tests until they can be fixed
- Update mocking setup to work with current Node.js/Vitest versions