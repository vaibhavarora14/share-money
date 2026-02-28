export default {
  async fetch(request: Request, env: { SUPABASE_URL: string }): Promise<Response> {
    const url = new URL(request.url);
    const supabaseUrl = new URL(env.SUPABASE_URL);

    // Rewrite the URL to target the actual Supabase instance
    url.hostname = supabaseUrl.hostname;
    url.protocol = supabaseUrl.protocol;
    url.port = supabaseUrl.port;

    const modifiedRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });

    return fetch(modifiedRequest);
  },
};
