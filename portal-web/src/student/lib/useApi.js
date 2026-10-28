import { useCallback, useEffect, useRef, useState } from 'react';
import { api, parseApiError } from './api.js';

/**
 * GETs `url` (re-fetching when it changes) and tracks loading / error state.
 * Pass null to skip. `reload()` refetches; `setData` allows local updates.
 */
export function useApi(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url);
      if (id === requestId.current) setData(res.data);
    } catch (err) {
      if (id === requestId.current) setError(parseApiError(err).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
