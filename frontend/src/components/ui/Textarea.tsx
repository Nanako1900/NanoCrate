import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useFieldProps } from './FormField';
import { controlBase } from './Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, rows = 3, ...rest }: TextareaProps) {
  const field = useFieldProps();
  const ariaInvalid = field['aria-invalid'] || invalid || undefined;
  return (
    <textarea
      rows={rows}
      className={cn(controlBase, 'resize-y px-3 py-2 leading-relaxed', className)}
      {...field}
      {...rest}
      aria-invalid={ariaInvalid}
    />
  );
}
