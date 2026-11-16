// The SPA profile picker and the legacy JSON API share /profiles.
// Browser navigation goes through the public SPA shell; data requests keep their auth middleware.
export function profilePageRedirect(req, res, next) {
  const html = String(req.headers?.accept || '').toLowerCase().includes('text/html');
  const navigation = ['GET', 'HEAD'].includes(req.method) && html && !Object.keys(req.query || {}).length && !req.headers?.authorization;
  if (navigation) return res.redirect(303, '/');
  return next();
}
