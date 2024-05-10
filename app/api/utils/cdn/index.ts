
interface ByteScaleDeleteParams{
  queryString: {};
}


export async function deleteFile(params: ByteScaleDeleteParams) {  
    const baseUrl  = "https://api.bytescale.com";
    const path     = `/v2/accounts/${process.env.BYTESCALE_ACCOUNT_ID}/files`;
    const entries  = (obj: { [s: string]: unknown; } | ArrayLike<unknown>) => Object.entries(obj).filter(([,val]) => (val ?? null) !== null);
    const query    = entries(params.queryString ?? {})
                       .flatMap(([k,v]) => Array.isArray(v) ? v.map(v2 => [k,v2]) : [[k,v]])
                       .map(kv => kv.join("=")).join("&");
    
    const queryUrl = `${baseUrl}${path}${query.length > 0 ? "?" : ""}${query}`
    const payload = {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${process.env.NEXT_SECRET_BYTESCALE_API_KEY}`,
      }
    }
    
    console.log(`queryUrl: ${queryUrl}, payload: ${JSON.stringify(payload)}`)
    const response = await fetch(queryUrl, payload);

    if (Math.floor(response.status / 100) !== 2) {
      const result = await response.json();
      throw new Error(`Bytescale API Error: ${JSON.stringify(result)}`);
    }
  }
