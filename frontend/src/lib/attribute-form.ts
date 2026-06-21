import type { AttributeSchema } from '@/services/admin-types';

/**
 * Client-side helpers for the ★ schema-driven attribute form. Validation mirrors
 * the server's (mocks/admin/store.validateAttributes) so the field-located errors
 * shown inline match what the backend would reject with `validation_failed`.
 * Form values are kept as strings (number inputs included) + booleans, then
 * coerced to typed attributes on submit.
 */
export type AttributeFormValues = Record<string, string | boolean>;

export function emptyAttributeValues(schema: AttributeSchema): AttributeFormValues {
  const values: AttributeFormValues = {};
  for (const field of schema.fields) values[field.name] = field.type === 'bool' ? false : '';
  return values;
}

/** Seed the form from a product's stored attributes (numbers → strings). */
export function attributeValuesFrom(
  schema: AttributeSchema,
  attributes: Record<string, string | number | boolean>,
): AttributeFormValues {
  const values = emptyAttributeValues(schema);
  for (const field of schema.fields) {
    const current = attributes[field.name];
    if (current === undefined) continue;
    values[field.name] = field.type === 'bool' ? Boolean(current) : String(current);
  }
  return values;
}

/** Validate values → map of fieldName → error message (empty when valid). */
export function validateAttributeValues(schema: AttributeSchema, values: AttributeFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of schema.fields) {
    const label = field.label ?? field.name; // §9.5 fields may omit `label`
    const value = values[field.name];
    // A boolean is always "present" (true or false); only text/number/select
    // can be empty and thus fail a required check.
    const empty = field.type !== 'bool' && (value === '' || value === undefined || value === null);
    if (field.required && empty) {
      errors[field.name] = `${label} is required.`;
      continue;
    }
    if (empty) continue;
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      errors[field.name] = `${label} must be a number.`;
    }
    if (field.type === 'select' && field.options && !field.options.includes(String(value))) {
      errors[field.name] = `Choose a valid ${label.toLowerCase()}.`;
    }
  }
  return errors;
}

/** Convert form values to typed attributes for submission (drops empty optional). */
export function coerceAttributes(
  schema: AttributeSchema,
  values: AttributeFormValues,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const field of schema.fields) {
    const value = values[field.name];
    if (field.type === 'bool') {
      out[field.name] = Boolean(value);
    } else if (value === '' || value === undefined) {
      continue; // omit empty optional fields
    } else if (field.type === 'number') {
      out[field.name] = Number(value);
    } else {
      out[field.name] = String(value);
    }
  }
  return out;
}
