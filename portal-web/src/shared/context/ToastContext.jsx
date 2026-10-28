import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const styles = {
  success: { Icon: CheckCircle2, cls: 'border-emerald-200 text-emerald-800', icon: 'text-emerald-600' },
  error: { Icon: AlertCircle, cls: 'border-red-200 text-red-800', icon: 'text-red-600' },
  info: { Icon: Info, cls: 'border-navy-100 text-navy-800', icon: 'text-navy-600' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, type = 'success', duration = 5000) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, message, type }]);
      if (duration) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
        {toasts.map(({ id, message, type }) => {
          const s = styles[type] ?? styles.info;
          return (
            <div
              key={id}
              role={type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-xl shadow-navy-900/10 ${s.cls}`}
            >
              <s.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.icon}`} />
              <p className="flex-1">{message}</p>
              <button onClick={() => dismiss(id)} className="rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
