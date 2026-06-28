export function onRequest(context) {
  const url = new URL(context.request.url);
  const pathSegments = Array.isArray(context.params.path) ? context.params.path : [];
  url.pathname = pathSegments.length
    ? `/innovation-day/${pathSegments.join('/')}`
    : '/innovation-day/';

  return Response.redirect(url.toString(), 301);
}
