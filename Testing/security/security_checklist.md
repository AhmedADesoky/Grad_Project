# EWC Writing Coach — Security Test Checklist

## 1. JWT Validation

| Test | Location | Status |
|------|----------|--------|
| Missing token rejected with "Authentication required." | `tests/test_auth_middleware.py::TestRequireAuth::test_raises_when_no_token` | Automated |
| Expired token rejected with "Token expired." | `tests/test_auth_middleware.py::TestRequireAuth::test_raises_for_expired_token` | Automated |
| Token signed with wrong secret rejected | `tests/test_auth_middleware.py::TestRequireAuth::test_raises_for_wrong_user_id` | Automated |
| Cross-user access rejected (token sub ≠ User_Id arg) | `tests/test_security.py::TestCrossUserAccess` | Automated |
| Empty "sub" claim rejected | `tests/test_security.py::TestCrossUserAccess::test_empty_subject_in_token_rejected` | Automated |
| Node.js auth middleware rejects missing token | `src/__tests__/auth.test.js` | Automated |
| Node.js auth middleware rejects expired token | `src/__tests__/auth.test.js` | Automated |

**Verified by**: `tests/test_auth_middleware.py`, `src/__tests__/auth.test.js`, `tests/test_security.py`

---

## 2. SQL Injection

**N/A — MongoDB is used (NoSQL)**

The project uses MongoDB exclusively (via Mongoose for Node.js and Djongo for Django).
MongoDB is not vulnerable to SQL injection. Query parameter injection (NoSQL injection)
is mitigated because:

- Mongoose schema typing prevents arbitrary operator injection into typed fields.
- GraphQL input types constrain field types at the schema level before they reach the DB.
- Raw query operators (`$where`, `$expr`) are never used with user-supplied data.

**Manual check**: Search codebase for any `eval:` or `$where:` usage. Currently: none found.

---

## 3. XSS Prevention

| Check | Details |
|-------|---------|
| React auto-escaping | React's JSX escapes all string interpolations by default — no `dangerouslySetInnerHTML` usage in critical components. |
| Email HTML | Email templates use server-side string interpolation. User-controlled values (userName, score, level) are numbers/alphanumeric strings validated by GraphQL schema. |
| GraphQL schema types | All user-facing input fields are typed (String, Int, Boolean) — no raw HTML input accepted. |

**Manual check items**:
- [ ] Confirm no `dangerouslySetInnerHTML` is used with user-supplied content in React components.
- [ ] Verify email templates do not embed user-controlled HTML.
- [ ] Check PDFDetail component renders extracted text as escaped React nodes, not raw HTML.

---

## 4. Rate Limiting

| Endpoint / Action | Limit | Enforced by |
|-------------------|-------|-------------|
| `Generate_Plan` mutation | 5 calls / hour | `@rate_limit(5, 3600)` in Django middleware |
| `Adjust_Plan` mutation | Rate-limited | `@rate_limit` decorator |
| Node.js API routes | 100 req / 15 min | `express-rate-limit` on all routes |
| Exam submission | 3 exams / day per user | BullMQ worker `MAX_EXAMS_PER_DAY` guard |

**Automated tests**: `tests/test_security.py::TestRateLimitingSecurity`

**Manual check items**:
- [ ] Confirm `express-rate-limit` is applied to the `/graphql` Express route in `server.js`.
- [ ] Confirm all high-cost Django mutations (plan generation, exam evaluation) use `@rate_limit`.

---

## 5. CORS Header Checks

| Setting | Expected Value |
|---------|---------------|
| `Access-Control-Allow-Origin` | Set to the known frontend origin (env: `FRONTEND_ORIGIN` / `CORS_ALLOWED_ORIGINS`) |
| `Access-Control-Allow-Credentials` | `true` (cookies used for refresh tokens) |
| Wildcard origin in production | Should be `false` — must be a specific origin |

**Manual verification steps**:

1. With the backend running, send:
   ```
   curl -v -X OPTIONS http://localhost:4000/graphql \
     -H "Origin: http://malicious.com" \
     -H "Access-Control-Request-Method: POST"
   ```
   Expected: `Access-Control-Allow-Origin` should NOT be `http://malicious.com`.

2. Check Node.js `server.js` CORS config:
   - `origin` should be set to `process.env.FRONTEND_ORIGIN`, not `'*'`.
   - `credentials: true` should be set.

3. Check Django `settings.py`:
   - `CORS_ALLOWED_ORIGINS` should be a list of known origins.
   - `CORS_ALLOW_ALL_ORIGINS` should be `False` in production.

---

## 6. Sensitive Data Exposure

| Check | Status |
|-------|--------|
| Passwords never stored in plaintext | Bcrypt hashing via `bcryptjs` |
| JWT secrets not hardcoded | Read from `.env` (not committed to git) |
| `.env` files in `.gitignore` | Manual check required |
| Refresh tokens hashed before DB storage | `HashToken()` in `token.js` |
| Error messages don't leak stack traces | GraphQL `formatError` strips internal details |

---

## Running Security Tests

```bash
# Django (from Backend/AI_Backend/)
pytest tests/test_security.py -v
pytest tests/test_auth_middleware.py -v

# Node.js (from Backend/User_Backend/)
npm test -- --testPathPattern=auth
```
