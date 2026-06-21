import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { DynamicAttributeForm, attributeFieldId } from '@/components/admin/DynamicAttributeForm';
import { VariantEditor } from '@/components/admin/VariantEditor';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastContext';
import { useAdminProduct, useAdminProductTypes, useCreateProduct, useUpdateProduct } from '@/hooks/admin/useAdminProducts';
import {
  attributeValuesFrom,
  coerceAttributes,
  emptyAttributeValues,
  validateAttributeValues,
  type AttributeFormValues,
} from '@/lib/attribute-form';
import { ApiError } from '@/services/api';
import type { AttributeSchema, ProductStatus } from '@/services/admin-types';

const EMPTY_SCHEMA: AttributeSchema = { fields: [] };

export function AdminProductEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const typesQuery = useAdminProductTypes();
  const productQuery = useAdminProduct(id ?? '');
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(id ?? '');

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProductStatus>('draft');
  const [attrValues, setAttrValues] = useState<AttributeFormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const schema = typesQuery.data?.find((t) => t.key === type)?.attribute_schema ?? EMPTY_SCHEMA;

  // Populate once when editing an existing product (after both queries resolve).
  useEffect(() => {
    if (loadedRef.current || !isEdit) return;
    const product = productQuery.data;
    const types = typesQuery.data;
    if (!product || !types) return;
    loadedRef.current = true;
    setName(product.name);
    setType(product.type);
    setDescription(product.description);
    setStatus(product.status);
    const s = types.find((t) => t.key === product.type)?.attribute_schema ?? EMPTY_SCHEMA;
    setAttrValues(attributeValuesFrom(s, product.attributes));
  }, [isEdit, productQuery.data, typesQuery.data]);

  function onTypeChange(nextType: string) {
    setType(nextType);
    const s = typesQuery.data?.find((t) => t.key === nextType)?.attribute_schema ?? EMPTY_SCHEMA;
    setAttrValues(emptyAttributeValues(s));
    setErrors({});
  }

  function focusFirstError(fieldErrors: Record<string, string>, nameInvalid: boolean) {
    const target = nameInvalid ? 'product-name' : attributeFieldId(Object.keys(fieldErrors)[0] ?? '');
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  }

  async function submit() {
    setFormError(null);
    const nameInvalid = !name.trim();
    const fieldErrors = validateAttributeValues(schema, attrValues);
    setErrors(fieldErrors);
    if (nameInvalid) setFormError('Product name is required.');
    if (nameInvalid || Object.keys(fieldErrors).length > 0) {
      focusFirstError(fieldErrors, nameInvalid);
      return;
    }
    const payload = { name: name.trim(), type, description: description.trim(), status, attributes: coerceAttributes(schema, attrValues) };
    try {
      if (isEdit) {
        await updateProduct.mutateAsync(payload);
        toast({ tone: 'success', title: 'Product saved' });
      } else {
        const created = await createProduct.mutateAsync(payload);
        toast({ tone: 'success', title: 'Product created', description: 'Now add variants and SKUs.' });
        navigate(`/admin/products/${created.id}`);
      }
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not save the product.');
    }
  }

  if (isEdit && productQuery.isError) {
    return (
      <>
        <AdminPageHeader breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Products', to: '/admin/products' }, { label: 'Edit' }]} title="Edit product" />
        <ErrorState error={productQuery.error} onRetry={() => void productQuery.refetch()} />
      </>
    );
  }

  const pending = createProduct.isPending || updateProduct.isPending;

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Products', to: '/admin/products' }, { label: isEdit ? name || 'Edit' : 'New product' }]}
        title={isEdit ? 'Edit product' : 'New product'}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/products')} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} loading={pending}>
              {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6">
        {formError && (
          <p role="alert" className="rounded-md border border-stock-out-ink/30 bg-stock-out-bg px-4 py-3 text-sm text-stock-out-ink">
            {formError}
          </p>
        )}

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" htmlFor="product-name" required className="sm:col-span-2" error={!name.trim() && formError ? 'Product name is required.' : undefined}>
              <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nano75" />
            </FormField>
            <FormField label="Type" required>
              <Select value={type} onChange={(e) => onTypeChange(e.target.value)} disabled={isEdit && !loadedRef.current}>
                <option value="">Select…</option>
                {typesQuery.data?.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
            </FormField>
            <FormField label="Description" className="sm:col-span-2">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="A 75% gasket-mounted board…" />
            </FormField>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">Attributes</h2>
            {type && <span className="label-mono normal-case text-ink-faint">from {type} schema</span>}
          </div>
          {type ? (
            <DynamicAttributeForm schema={schema} values={attrValues} errors={errors} onChange={(n, v) => setAttrValues((prev) => ({ ...prev, [n]: v }))} disabled={pending} />
          ) : (
            <p className="text-sm text-ink-faint">Select a product type to configure its attributes.</p>
          )}
        </section>

        {isEdit && productQuery.data && <VariantEditor product={productQuery.data} />}
      </div>
    </>
  );
}
