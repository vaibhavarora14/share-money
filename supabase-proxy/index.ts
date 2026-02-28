export default {
  async fetch(request: Request, env: { SUPABASE_URL: string }): Promise<Response> {
    const url = new URL(request.url);
    const supabaseUrl = new URL(env.SUPABASE_URL);

    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 2. Rewrite URL
    url.hostname = supabaseUrl.hostname;
    url.protocol = supabaseUrl.protocol;
    url.port = supabaseUrl.port;

    const modifiedRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });

    // 3. Fetch from Supabase
    let response = await fetch(modifiedRequest);

    // 4. Fix Response Headers for CORS and Redirects
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, x-client-info");
    
    // For Auth redirects, we might need to fix the Location header if it points to Supabase instead of the proxy
    const location = newHeaders.get("Location");
    if (location && location.includes(supabaseUrl.hostname)) {
      newHeaders.set("Location", location.replace(supabaseUrl.hostname, new URL(request.url).hostname));
    }

    // De-chunk if it's a redirect or small response to ensure headers are clean
    const body = (response.status >= 300 && response.status < 400) ? null : response.body;

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
