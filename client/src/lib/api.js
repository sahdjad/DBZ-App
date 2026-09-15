// Schmaler Fetch-Wrapper für die DBZ-App-API.

async function request(method, path, body, isForm = false) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };
  if (body && isForm) {
    opts.body = body; // FormData
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(data?.error || `Fehler ${res.status}`);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  upload: (p, formData) => request('POST', p, formData, true),
  // Datei herunterladen, OHNE die App-Ansicht zu verlassen (wichtig auf iOS:
  // ein direkter <a href> zu einer Datei würde die Seite ersetzen).
  download: async (p, filename) => {
    const res = await fetch(`/api${p}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },
};
