import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import type { AttributeField, AttributeSchema } from '@/services/admin-types';
import type { AttributeFormValues } from '@/lib/attribute-form';

/** Stable id so the editor can focus the first invalid field on submit. */
export function attributeFieldId(name: string): string {
  return `attr-${name}`;
}

/** §9.5 fields may omit `label`; derive a readable one from the attribute name. */
function fieldLabel(field: AttributeField): string {
  if (field.label) return field.label;
  return field.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface DynamicAttributeFormProps {
  schema: AttributeSchema;
  values: AttributeFormValues;
  errors: Record<string, string>;
  onChange: (name: string, value: string | boolean) => void;
  disabled?: boolean;
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: AttributeField;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  disabled?: boolean;
}) {
  switch (field.type) {
    case 'select':
      return (
        <Select value={String(value)} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">请选择…</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      );
    case 'number':
      return (
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className="font-mono tabular-nums"
          />
          {field.unit && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-2xs text-ink-faint">
              {field.unit}
            </span>
          )}
        </div>
      );
    default:
      return (
        <Input
          type="text"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      );
  }
}

/** Renders a product type's attribute_schema as a form: required marks, inline
 *  per-field errors, help text — all derived from the schema, nothing hardcoded. */
export function DynamicAttributeForm({ schema, values, errors, onChange, disabled }: DynamicAttributeFormProps) {
  if (schema.fields.length === 0) {
    return <p className="text-sm text-ink-faint">该商品类型没有属性。</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {schema.fields.map((field) => {
        const id = attributeFieldId(field.name);
        if (field.type === 'bool') {
          return (
            <div key={field.name} className="flex flex-col gap-1.5 sm:col-span-2">
              <Checkbox
                id={id}
                checked={Boolean(values[field.name])}
                onChange={(e) => onChange(field.name, e.target.checked)}
                disabled={disabled}
                aria-describedby={field.help ? `${id}-help` : undefined}
                label={
                  <>
                    {fieldLabel(field)}
                    {field.required && <span className="ml-1 text-stock-out-ink" aria-hidden="true">*</span>}
                  </>
                }
              />
              {field.help && (
                <p id={`${id}-help`} className="text-xs text-ink-faint">
                  {field.help}
                </p>
              )}
            </div>
          );
        }
        return (
          <FormField
            key={field.name}
            htmlFor={id}
            label={fieldLabel(field)}
            required={field.required}
            help={field.help}
            error={errors[field.name]}
          >
            <FieldControl field={field} value={values[field.name] ?? ''} onChange={(v) => onChange(field.name, v)} disabled={disabled} />
          </FormField>
        );
      })}
    </div>
  );
}
