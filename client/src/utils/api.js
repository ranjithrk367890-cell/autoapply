export async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    let data = null;
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (e) {
        data = { error: 'Invalid JSON response from server' };
      }
    } else {
      const text = await res.text();
      data = { error: text || `HTTP ${res.status} ${res.statusText}` };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: data || { error: `HTTP ${res.status} Error` },
        error: data?.error || `HTTP ${res.status} ${res.statusText}`
      };
    }

    return {
      ok: true,
      status: res.status,
      data
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err.message || 'Network request failed'
    };
  }
}
