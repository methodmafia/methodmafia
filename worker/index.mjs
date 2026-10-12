const WWW_HOST = 'www.themethodmafia.com';
const APEX_ORIGIN = 'https://themethodmafia.com';

function apexRedirectUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (url.hostname !== WWW_HOST) return null;
  return APEX_ORIGIN + url.pathname + url.search;
}

export default {
  async fetch(request, env) {
    const target = apexRedirectUrl(request.url);
    if (target) return Response.redirect(target, 301);
    return env.ASSETS.fetch(request);
  }
};

export { apexRedirectUrl };
