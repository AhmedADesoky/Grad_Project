import { VerifyAccessToken } from '../utils/token.js';

/**
 * Extracts and verifies the Bearer JWT from the request.
 * Returns the decoded payload ({ sub: userId, ... }) or null if missing/invalid.
 * Never throws — callers decide what to do with a null result.
 */
export function extractUser(req) {
  const header = req?.headers?.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  try {
    return VerifyAccessToken(token);   // throws on expired / invalid
  } catch {
    return null;
  }
}

/**
 * Apollo context builder — call this from expressMiddleware context option.
 * Attaches `context.user` (decoded JWT payload) to every GraphQL request.
 *
 * Usage in server.js:
 *   expressMiddleware(server, {
 *     context: buildContext,
 *   })
 */
export async function buildContext({ req, res }) {
  return {
    req,
    res,
    user: extractUser(req),   // null when unauthenticated
  };
}

/**
 * requireAuth — wraps a resolver so it throws a clean GraphQL error when:
 *   - No valid JWT is present                    → "Authentication required."
 *   - JWT userId doesn't match the User_Id arg   → "Forbidden."
 *
 * Usage:
 *   Submit_Exam: requireAuth(async (_, { User_Id, ... }, context) => { ... })
 *
 * The verified userId is available as context.user.sub inside the resolver.
 */
export function requireAuth(resolver) {
  return async (parent, args, context, info) => {
    if (!context.user) {
      throw new Error('Authentication required.');
    }

    const tokenUserId = String(context.user.sub ?? '');

    // If the mutation/query carries a User_Id argument, it must match the token
    const claimedId = args.User_Id ?? args.Id ?? null;
    if (claimedId && String(claimedId) !== tokenUserId) {
      throw new Error('Forbidden.');
    }

    return resolver(parent, args, context, info);
  };
}
