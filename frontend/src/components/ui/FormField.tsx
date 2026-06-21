import { createContext, useContext, useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Props a control inside a FormField should spread to inherit the generated id,
 * aria-describedby (help + error), and aria-invalid. Controls fall back to their
 * own props when used standalone (outside a FormField).
 */
export function useFieldProps(): {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
} {
  const ctx = useContext(FieldContext);
  if (!ctx) return {};
  return {
    id: ctx.id,
    'aria-describedby': ctx.describedBy,
    'aria-invalid': ctx.invalid || undefined,
    'aria-required': ctx.required || undefined,
  };
}

interface FormFieldProps {
  label: ReactNode;
  /** Stable id for the control; auto-generated when omitted. */
  htmlFor?: string;
  required?: boolean;
  help?: ReactNode;
  /** When set, renders as the error message and flips the field to invalid. */
  error?: ReactNode;
  /** Hide the visual label (still read by SR) for compact/table-embedded fields. */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

/** Three-part field: label (+required mark), control slot, then help/error.
 *  Error is a live region tied to the control via aria-describedby. */
export function FormField({
  label,
  htmlFor,
  required = false,
  help,
  error,
  hideLabel = false,
  className,
  children,
}: FormFieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);
  const describedBy =
    [help ? helpId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid, required }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label
          htmlFor={id}
          className={cn(
            'text-sm font-medium text-ink',
            hideLabel && 'sr-only',
          )}
        >
          {label}
          {required && (
            <span className="ml-1 text-stock-out-ink" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {help && !invalid && (
          <p id={helpId} className="text-xs text-ink-faint">
            {help}
          </p>
        )}
        {children}
        {invalid && (
          <p id={errorId} role="alert" className="flex items-center gap-1 text-xs text-stock-out-ink">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M12 8v5M12 16.5v.5" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
