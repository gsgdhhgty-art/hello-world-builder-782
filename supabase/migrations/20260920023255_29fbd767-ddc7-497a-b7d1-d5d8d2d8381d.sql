CREATE POLICY "Organization members can view product images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
);

CREATE POLICY "Product editors can upload product images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND public.has_perm('products.edit')
);

CREATE POLICY "Product editors can update product images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND public.has_perm('products.edit')
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND public.has_perm('products.edit')
);

CREATE POLICY "Product editors can delete product images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = public.current_org_id()::text
  AND public.has_perm('products.edit')
);