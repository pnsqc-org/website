export function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = '/innovation-day/';

  return Response.redirect(url.toString(), 301);
}
