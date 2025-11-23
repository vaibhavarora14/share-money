# API Versioning Maintenance Strategy

## Overview

This document explains how multiple API versions will coexist and be maintained in the ShareMoney application. It covers version routing, backward compatibility, deprecation policies, and practical maintenance approaches.

## Current API Structure

- **Platform**: Netlify Functions (serverless)
- **Routing**: Via `netlify.toml` redirects (`/api/*` → `/.netlify/functions/*`)
- **Functions**: Individual TypeScript files per endpoint
- **No versioning**: Currently all endpoints are unversioned

## Versioning Strategies

### Strategy 1: URL Path Versioning (Recommended)

**Pattern**: `/api/v1/transactions`, `/api/v2/transactions`

#### How It Works

```
/api/v1/transactions  → /.netlify/functions/v1/transactions
/api/v2/transactions  → /.netlify/functions/v2/transactions
/api/transactions      → /.netlify/functions/v1/transactions (default)
```

#### File Structure

```
netlify/functions/
├── v1/
│   ├── transactions.ts
│   ├── groups.ts
│   └── balances.ts
├── v2/
│   ├── transactions.ts  # New version with breaking changes
│   ├── groups.ts
│   └── balances.ts
└── shared/
    ├── utils/
    │   ├── auth.ts      # Shared utilities
    │   └── validation.ts
    └── types/
        └── api.ts       # Shared types
```

#### Maintenance Approach

**Parallel Versions:**
- Both `v1` and `v2` run simultaneously
- Old clients continue using `v1`
- New clients use `v2`
- Each version is independently maintained

**Code Sharing:**
- Common utilities live in `shared/` directory
- Each version can import shared code
- Version-specific logic stays in version folders

**Example - Shared Utility:**

```typescript
// netlify/functions/shared/utils/auth.ts
export async function verifyAuth(event: any) {
  // Shared authentication logic
  // Used by both v1 and v2
}

// netlify/functions/v1/transactions.ts
import { verifyAuth } from '../../shared/utils/auth';

// netlify/functions/v2/transactions.ts
import { verifyAuth } from '../../shared/utils/auth';
```

**Example - Version-Specific Logic:**

```typescript
// netlify/functions/v1/transactions.ts
export const handler: Handler = async (event) => {
  // v1 implementation - returns old format
  return {
    statusCode: 200,
    body: JSON.stringify({
      id: transaction.id,
      amount: transaction.amount,
      // Old format
    })
  };
};

// netlify/functions/v2/transactions.ts
export const handler: Handler = async (event) => {
  // v2 implementation - returns new format
  return {
    statusCode: 200,
    body: JSON.stringify({
      transactionId: transaction.id,  // Breaking change: renamed field
      amount: {
        value: transaction.amount,     // Breaking change: nested structure
        currency: transaction.currency
      },
      // New format
    })
  };
};
```

### Strategy 2: Header-Based Versioning

**Pattern**: `Accept: application/vnd.sharemoney.v1+json`

#### How It Works

- Single endpoint handles all versions
- Version determined by `Accept` header
- Internal routing based on header value

#### Pros & Cons

**Pros:**
- Cleaner URLs (no version in path)
- Single codebase per endpoint
- Easier to maintain shared logic

**Cons:**
- Harder to debug (version hidden in headers)
- More complex routing logic
- Less explicit for clients

### Strategy 3: Query Parameter Versioning

**Pattern**: `/api/transactions?version=v1`

#### Pros & Cons

**Pros:**
- Simple to implement
- Easy to test

**Cons:**
- Not RESTful
- Harder to cache
- Version can be forgotten

## Recommended Approach: URL Path Versioning

We recommend **Strategy 1 (URL Path Versioning)** because:

1. **Explicit**: Version is visible in URL
2. **Cacheable**: Different versions can be cached separately
3. **Maintainable**: Clear separation of code
4. **Testable**: Easy to test specific versions
5. **Industry Standard**: Common pattern (GitHub, Stripe, etc.)

## Maintenance Workflow

### Phase 1: Initial Setup (v1)

1. **Move existing code to v1 folder:**
   ```bash
   mkdir -p netlify/functions/v1
   mv netlify/functions/transactions.ts netlify/functions/v1/
   mv netlify/functions/groups.ts netlify/functions/v1/
   # ... etc
   ```

2. **Update netlify.toml:**
   ```toml
   [[redirects]]
   from = "/api/v1/transactions"
   to = "/.netlify/functions/v1/transactions"
   status = 200

   [[redirects]]
   from = "/api/transactions"  # Default to v1
   to = "/.netlify/functions/v1/transactions"
   status = 200
   ```

3. **Update client code:**
   ```typescript
   // mobile/utils/api.ts
   const API_BASE = '/api/v1';
   ```

### Phase 2: Creating v2 (Breaking Changes)

1. **Create v2 folder:**
   ```bash
   mkdir -p netlify/functions/v2
   ```

2. **Copy v1 to v2 as starting point:**
   ```bash
   cp netlify/functions/v1/transactions.ts netlify/functions/v2/
   ```

3. **Implement breaking changes in v2:**
   ```typescript
   // netlify/functions/v2/transactions.ts
   // Modify response format, add new fields, etc.
   ```

4. **Add routing:**
   ```toml
   [[redirects]]
   from = "/api/v2/transactions"
   to = "/.netlify/functions/v2/transactions"
   status = 200
   ```

5. **Update client gradually:**
   - New features use v2
   - Old features continue using v1
   - Migrate incrementally

### Phase 3: Maintaining Both Versions

#### Bug Fixes

**Critical Security Fixes:**
- Apply to **both** v1 and v2 immediately
- Use shared utilities when possible
- Test both versions

**Example:**
```typescript
// Shared utility with security fix
// netlify/functions/shared/utils/auth.ts
export async function verifyAuth(event: any) {
  // Security fix applied here
  // Automatically benefits both v1 and v2
}
```

**Non-Critical Bug Fixes:**
- Fix in v2 (current version)
- Evaluate if v1 needs fix based on:
  - How many users still on v1
  - Severity of bug
  - Effort to fix

#### Feature Additions

**New Features:**
- Add to v2 only
- v1 remains stable
- Document migration path

**Backward-Compatible Features:**
- Can add to both versions
- Use feature flags if needed

#### Code Maintenance

**Shared Code:**
- Keep common logic in `shared/` directory
- Both versions import shared utilities
- Reduces duplication

**Version-Specific Code:**
- Keep in version folders
- Document differences
- Consider deprecation timeline

### Phase 4: Deprecation

#### Deprecation Timeline

1. **Announcement** (3-6 months before removal):
   - Add deprecation header: `X-API-Deprecated: true`
   - Add deprecation date: `X-API-Deprecation-Date: 2025-07-01`
   - Log warnings in responses

2. **Migration Period**:
   - Monitor v1 usage
   - Help clients migrate
   - Provide migration guides

3. **Sunset**:
   - Remove v1 code
   - Update routing
   - v2 becomes default

#### Deprecation Headers

```typescript
// netlify/functions/v1/transactions.ts
export const handler: Handler = async (event) => {
  const response = createSuccessResponse(data, 200);
  
  // Add deprecation headers
  response.headers = {
    ...response.headers,
    'X-API-Deprecated': 'true',
    'X-API-Deprecation-Date': '2025-07-01',
    'X-API-Sunset-Date': '2025-07-01',
    'X-API-Version': 'v1',
    'X-API-Latest-Version': 'v2',
    'Link': '</api/v2/transactions>; rel="successor-version"'
  };
  
  return response;
};
```

## Practical Examples

### Example 1: Adding a New Field (Non-Breaking)

**v1 Response:**
```json
{
  "id": 1,
  "amount": 100,
  "description": "Dinner"
}
```

**v2 Response (adds optional field):**
```json
{
  "id": 1,
  "amount": 100,
  "description": "Dinner",
  "category": "food"  // New optional field
}
```

**Maintenance:**
- v1 continues working (field is optional)
- v2 adds new field
- No breaking change, but version bump for clarity

### Example 2: Renaming a Field (Breaking)

**v1 Response:**
```json
{
  "id": 1,
  "amount": 100
}
```

**v2 Response:**
```json
{
  "transactionId": 1,  // Renamed from "id"
  "amount": 100
}
```

**Maintenance:**
- v1 keeps old format
- v2 uses new format
- Both versions maintained in parallel
- Clients migrate to v2 over time

### Example 3: Changing Response Structure (Breaking)

**v1 Response:**
```json
{
  "id": 1,
  "amount": 100,
  "currency": "USD"
}
```

**v2 Response:**
```json
{
  "id": 1,
  "amount": {
    "value": 100,
    "currency": "USD"
  }
}
```

**Maintenance:**
- v1 maintains flat structure
- v2 uses nested structure
- Both versions coexist
- Migration guide provided

### Example 4: Removing an Endpoint

**Scenario:** Remove `/api/v1/old-feature`

**Process:**
1. Announce deprecation (3 months)
2. Add deprecation headers
3. Provide alternative endpoint
4. Remove after sunset date

## Code Organization

### Recommended Structure

```
netlify/functions/
├── v1/                    # API version 1
│   ├── transactions.ts
│   ├── groups.ts
│   └── balances.ts
├── v2/                    # API version 2
│   ├── transactions.ts
│   ├── groups.ts
│   └── balances.ts
├── shared/                # Shared code
│   ├── utils/
│   │   ├── auth.ts
│   │   ├── cors.ts
│   │   ├── error-handler.ts
│   │   ├── response.ts
│   │   └── validation.ts
│   └── types/
│       └── api.ts
└── version.ts             # Version info endpoint
```

### Shared Utilities Pattern

```typescript
// netlify/functions/shared/utils/auth.ts
export async function verifyAuth(event: any): Promise<AuthResult> {
  // Shared authentication logic
  // Used by all API versions
}

// netlify/functions/v1/transactions.ts
import { verifyAuth } from '../../shared/utils/auth';

export const handler: Handler = async (event) => {
  const authResult = await verifyAuth(event);
  // v1-specific logic
};

// netlify/functions/v2/transactions.ts
import { verifyAuth } from '../../shared/utils/auth';

export const handler: Handler = async (event) => {
  const authResult = await verifyAuth(event);
  // v2-specific logic
};
```

## Version Detection & Routing

### Client-Side Version Selection

```typescript
// mobile/utils/api.ts

const API_VERSION = 'v1'; // or 'v2'

export const apiCall = async (endpoint: string) => {
  const url = `/api/${API_VERSION}${endpoint}`;
  // Make request
};
```

### Server-Side Version Routing

```toml
# netlify.toml

# Version 1 (legacy)
[[redirects]]
from = "/api/v1/transactions"
to = "/.netlify/functions/v1/transactions"
status = 200

# Version 2 (current)
[[redirects]]
from = "/api/v2/transactions"
to = "/.netlify/functions/v2/transactions"
status = 200

# Default to latest
[[redirects]]
from = "/api/transactions"
to = "/.netlify/functions/v2/transactions"
status = 200
```

## Testing Strategy

### Version-Specific Tests

```typescript
// tests/v1/transactions.test.ts
describe('API v1 - Transactions', () => {
  it('should return v1 format', async () => {
    const response = await fetch('/api/v1/transactions');
    const data = await response.json();
    expect(data).toHaveProperty('id');  // v1 format
  });
});

// tests/v2/transactions.test.ts
describe('API v2 - Transactions', () => {
  it('should return v2 format', async () => {
    const response = await fetch('/api/v2/transactions');
    const data = await response.json();
    expect(data).toHaveProperty('transactionId');  // v2 format
  });
});
```

### Shared Code Tests

```typescript
// tests/shared/auth.test.ts
describe('Shared Auth Utility', () => {
  it('should work for both v1 and v2', async () => {
    // Test shared authentication logic
  });
});
```

## Monitoring & Analytics

### Track Version Usage

```typescript
// Add to each handler
export const handler: Handler = async (event) => {
  // Log version usage
  console.log('API Version:', 'v1');
  console.log('Endpoint:', event.path);
  console.log('User Agent:', event.headers['user-agent']);
  
  // Send to analytics
  // trackApiVersion('v1', event.path);
};
```

### Metrics to Monitor

1. **Request Count by Version:**
   - How many requests to v1 vs v2
   - Track migration progress

2. **Error Rates by Version:**
   - Identify version-specific issues
   - Compare stability

3. **Response Times:**
   - Performance comparison
   - Identify bottlenecks

4. **Client Versions:**
   - Which app versions use which API versions
   - Plan deprecation timeline

## Cost Considerations

### Netlify Functions Costs

**Current (Single Version):**
- All requests go to one function
- Simple, cost-effective

**Multi-Version (Parallel):**
- Requests split across versions
- Each version is a separate function
- Cost = Sum of all versions

**Optimization:**
- Use shared code to reduce bundle size
- Monitor unused versions
- Deprecate old versions promptly

### Cost Management

1. **Monitor Function Invocations:**
   - Track usage per version
   - Identify when to deprecate

2. **Optimize Shared Code:**
   - Reduce duplication
   - Smaller bundle sizes

3. **Sunset Old Versions:**
   - Remove unused versions
   - Reduce function count

## Migration Checklist

### When Creating v2

- [ ] Create v2 folder structure
- [ ] Copy v1 code as starting point
- [ ] Implement breaking changes
- [ ] Update netlify.toml routing
- [ ] Add version headers
- [ ] Write migration guide
- [ ] Update API documentation
- [ ] Test both versions
- [ ] Monitor usage

### When Deprecating v1

- [ ] Announce deprecation (3-6 months)
- [ ] Add deprecation headers
- [ ] Provide migration guide
- [ ] Monitor v1 usage
- [ ] Set sunset date
- [ ] Remove v1 code
- [ ] Update default routing to v2

## Best Practices

1. **Keep Versions Separate:**
   - Clear code boundaries
   - Easier to maintain

2. **Share Common Code:**
   - Reduce duplication
   - Single source of truth

3. **Document Changes:**
   - Changelog per version
   - Migration guides

4. **Monitor Usage:**
   - Track version adoption
   - Plan deprecation

5. **Test Both Versions:**
   - Don't break old clients
   - Ensure new version works

6. **Gradual Migration:**
   - Don't force immediate upgrade
   - Provide transition period

7. **Clear Communication:**
   - Deprecation notices
   - Migration timelines
   - Breaking change documentation

## Summary

**How Multiple Versions Work:**

1. **Parallel Execution**: v1 and v2 run simultaneously
2. **Code Sharing**: Common utilities in `shared/` directory
3. **Independent Maintenance**: Each version maintained separately
4. **Gradual Migration**: Clients migrate over time
5. **Deprecation**: Old versions removed after sunset period

**Maintenance Benefits:**

- ✅ Old clients continue working
- ✅ New features in new versions
- ✅ Breaking changes don't break existing clients
- ✅ Gradual migration path
- ✅ Clear version boundaries

**Maintenance Costs:**

- ⚠️ More code to maintain (mitigated by shared utilities)
- ⚠️ More functions to deploy (Netlify Functions)
- ⚠️ Need to test multiple versions
- ⚠️ Documentation for each version

**Recommendation:**

Start with v1, create v2 when needed, maintain both in parallel, deprecate v1 after migration period.
