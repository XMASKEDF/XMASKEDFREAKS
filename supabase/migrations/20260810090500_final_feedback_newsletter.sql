-- Additive final customer feedback and newsletter layer.
-- Public clients write through server routes using the service role; RLS keeps
-- subscriber data, feedback text, and customer identity out of public reads.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  language_code text not null default 'en',
  consent_status text not null default 'subscribed' check (consent_status in ('subscribed','unsubscribed','suppressed')),
  source text not null default 'newsletter_popup',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  last_email_sent_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','active','bounced','complained')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));
create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (consent_status, created_at desc);

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('concern','appreciation','suggestion','general')),
  original_text text not null check (char_length(original_text) between 1 and 100),
  original_language text not null default 'en',
  english_translation text,
  translation_status text not null default 'pending' check (translation_status in ('complete','pending','failed')),
  status text not null default 'New' check (status in ('New','Reviewed','Responded','Archived')),
  admin_notes text,
  submission_key text not null unique,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admin_users(id) on delete set null
);
create index if not exists customer_feedback_status_idx
  on public.customer_feedback (status, created_at desc);

create table if not exists public.customer_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid references public.customer_feedback(id) on delete cascade,
  event_type text not null check (event_type in ('submitted','moderated','translated','status_changed')),
  category text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

alter table public.newsletter_subscribers enable row level security;
alter table public.customer_feedback enable row level security;
alter table public.customer_feedback_events enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;
revoke all on public.customer_feedback from anon, authenticated;
revoke all on public.customer_feedback_events from anon, authenticated;

insert into public.email_templates(template_key, subject, body_text, transactional, allowed_variables)
values
  ('newsletter_live_alert', 'XMASKEDFREAKS', '{{message}}\n\n{{unsubscribeUrl}}', false, array['message','liveUrl','unsubscribeUrl']),
  ('newsletter_new_release', 'New from XMASKEDFREAKS', '{{releaseTitle}}\n{{description}}\n\n{{destinationUrl}}\n\n{{unsubscribeUrl}}', false, array['releaseTitle','description','destinationUrl','unsubscribeUrl'])
on conflict (template_key) do nothing;
