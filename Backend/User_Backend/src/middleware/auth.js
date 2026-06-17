export const authMiddleware = (req, res, next) => {
  req.user = null; // Temporary — will add JWT later
  next();
};