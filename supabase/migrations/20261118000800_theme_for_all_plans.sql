-- Custom form themes are available on every plan (they are not gated anywhere in the product).
update public.subscription_plans set features = features || '{"custom_theme": true}'::jsonb;
