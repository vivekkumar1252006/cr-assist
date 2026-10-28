import { useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2, QrCode } from 'lucide-react';
import { passwordStrength } from '@shared/lib/validation.js';

export function Logo({ light = false, size = 'md', showSubtitle = true, className = '' }) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/logo.png"
        alt="Class Representative ASSIST Logo"
        className={`${sizeClasses[size] || sizeClasses.md} rounded-xl object-contain bg-white shadow-md shadow-navy-950/10 ring-1 ring-slate-200/50 p-0.5 shrink-0`}
      />
      <div>
        <span className={`text-xl font-bold tracking-tight block leading-tight ${light ? 'text-white' : 'text-navy-900'}`}>
          CR <span className={light ? 'text-teal-300' : 'text-teal-600'}>Assist</span>
        </span>
        {showSubtitle && (
          <span className={`text-[10px] font-bold tracking-wider uppercase block ${light ? 'text-teal-200/90' : 'text-teal-700'}`}>
            Student Portal
          </span>
        )}
      </div>
    </div>
  );
}

const alertStyles = {
  error: { box: 'border-red-200 bg-red-50 text-red-800', Icon: AlertCircle },
  success: { box: 'border-teal-200 bg-teal-50 text-teal-800', Icon: CheckCircle2 },
  info: { box: 'border-navy-100 bg-navy-50 text-navy-800', Icon: Info },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertCircle },
};

export function Alert({ type = 'info', children }) {
  if (!children) return null;
  const { box, Icon } = alertStyles[type];
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex animate-fade-up gap-2.5 rounded-xl border px-4 py-3 text-sm ${box}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

const inputBase =
  'w-full rounded-xl border bg-white py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition ' +
  'focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50';
const inputState = (error) =>
  error
    ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
    : 'border-slate-200 hover:border-slate-300 focus:border-teal-500 focus:ring-teal-100';

/** Label + control + hint/error wrapper. `children` receives the generated input id. */
export function Field({ label, error, hint, required, children, className = '' }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy-900">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children(id, error ? `${id}-error` : hint ? `${id}-hint` : undefined)}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ label, error, hint, required, icon: Icon, className, inputClassName = '', ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => (
        <div className="relative">
          {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
          <input
            id={id}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={`${inputBase} ${inputState(error)} ${Icon ? 'pl-10' : 'pl-3.5'} pr-3.5 ${inputClassName}`}
            {...props}
          />
        </div>
      )}
    </Field>
  );
}

export function PasswordInput({ label, error, hint, required, icon: Icon, className, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => (
        <div className="relative">
          {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
          <input
            id={id}
            type={visible ? 'text' : 'password'}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={`${inputBase} ${inputState(error)} ${Icon ? 'pl-10' : 'pl-3.5'} pr-11`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-navy-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      )}
    </Field>
  );
}

/** `allowEmpty` makes the placeholder a selectable "none" option instead of a disabled prompt. */
export function SelectInput({ label, error, hint, required, options, placeholder, allowEmpty = false, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => (
        <select
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${inputBase} ${inputState(error)} px-3.5 ${props.value ? '' : 'text-slate-400'}`}
          {...props}
        >
          <option value="" disabled={!allowEmpty}>{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-slate-900">{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

const strengthColors = ['bg-slate-200', 'bg-red-500', 'bg-amber-500', 'bg-teal-500', 'bg-emerald-600'];
const strengthText = ['', 'text-red-600', 'text-amber-600', 'text-teal-600', 'text-emerald-700'];

export function PasswordStrength({ password }) {
  const { score, label } = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= score ? strengthColors[score] : 'bg-slate-200'}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Password strength: <span className={`font-semibold ${strengthText[score]}`}>{label}</span>
      </p>
    </div>
  );
}

export function Button({ loading, children, className = '', ...props }) {
  return (
    <button
      disabled={loading || props.disabled}
      className={
        'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-3 text-sm font-semibold text-white ' +
        'shadow-lg shadow-navy-900/20 transition hover:bg-navy-800 active:scale-[0.99] focus:outline-none focus-visible:ring-4 ' +
        'focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-70 ' + className
      }
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
