-- Sync2VA Student CRM
-- Run this entire file in the Supabase SQL Editor.
-- It is safe to run more than once.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.course_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  program_type text not null check (program_type in ('Intensive Training', 'Career Accelerator')),
  status text not null default 'Active' check (status in ('Active', 'Archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  course_group_id uuid not null references public.course_groups(id) on delete restrict,
  month smallint not null check (month between 1 and 12),
  year smallint not null check (year between 2020 and 2100),
  batch_number smallint not null check (batch_number in (1, 2)),
  name text not null,
  start_date date,
  end_date date,
  status text not null default 'Active' check (status in ('Active', 'Completed', 'Archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batches_course_month_year_number_key unique (course_group_id, month, year, batch_number)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  course_group_id uuid not null references public.course_groups(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  coach text,
  training_plan text not null default '2 Weeks' check (training_plan in ('2 Weeks', '1 Month')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students add column if not exists training_plan text;
update public.students set training_plan = '2 Weeks' where training_plan is null;
alter table public.students alter column training_plan set default '2 Weeks';
alter table public.students alter column training_plan set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'students_training_plan_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_training_plan_check check (training_plan in ('2 Weeks', '1 Month'));
  end if;
end;
$$;

create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  payment_status text not null default 'Pending Payment'
    check (payment_status in ('Pending Payment', 'Downpayment Paid', 'Fully Paid', 'Refunded')),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance numeric(12,2) not null default 0 check (balance >= 0),
  payment_method text check (payment_method is null or payment_method in ('GCash', 'Bank Transfer', 'PayPal', 'Cash', 'Other')),
  payment_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  student_status text not null default 'Active'
    check (student_status in ('Active', 'Inactive', 'Dropped', 'Completed', 'On Hold')),
  concern_type text check (concern_type is null or concern_type in ('Payment', 'Attendance', 'Coach Concern', 'Technical Issue', 'Behavior', 'Other')),
  concern_details text,
  concern_status text not null default 'Resolved' check (concern_status in ('Open', 'In Progress', 'Resolved')),
  priority text not null default 'Low' check (priority in ('Low', 'Medium', 'High')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classroom_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  invite_status text not null default 'Pending' check (invite_status in ('Yes', 'No', 'Pending')),
  date_sent date,
  sent_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  course_group_id uuid references public.course_groups(id) on delete cascade,
  activity_track text not null default 'Intensive' check (activity_track in ('Intensive', 'CAP')),
  name text not null unique,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.activities
  add column if not exists course_group_id uuid references public.course_groups(id) on delete cascade;
alter table public.activities add column if not exists activity_track text;
update public.activities
set activity_track = case
  when course_group_id is null and name in (
    'ATS Resume Creation',
    'Resume Optimization',
    'Interview Practice',
    'Mock Interview',
    'Mock Call',
    'Client Communication Practice',
    'Job Application Readiness'
  ) then 'CAP'
  else 'Intensive'
end
where activity_track is null;
alter table public.activities alter column activity_track set default 'Intensive';
alter table public.activities alter column activity_track set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'activities_activity_track_check'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_activity_track_check check (activity_track in ('Intensive', 'CAP'));
  end if;
end;
$$;

create table if not exists public.student_activities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete restrict,
  status text not null default 'Pending' check (status in ('Pending', 'Pass', 'Fail', 'Retake')),
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  coach_notes text,
  date_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_activities_student_activity_key unique (student_id, activity_id)
);

create table if not exists public.requirements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  attendance_status text not null default 'Pending' check (attendance_status in ('Met', 'Not Met', 'Pending')),
  activity_score_status text not null default 'Pending' check (activity_score_status in ('Passed', 'Failed', 'Pending')),
  readiness_status text not null default 'Pending' check (readiness_status in ('Ready', 'Not Ready', 'Pending')),
  coach_approval text not null default 'Pending' check (coach_approval in ('Approved', 'Not Approved', 'Pending')),
  admin_clearance text not null default 'Pending' check (admin_clearance in ('Cleared', 'Hold', 'Pending')),
  finance_clearance text not null default 'Pending' check (finance_clearance in ('Cleared', 'Hold', 'Pending')),
  overall_status text not null default 'For Review' check (overall_status in ('Certificate Ready', 'Not Ready', 'For Review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  certificate_type text not null
    check (certificate_type in ('Intensive Training Certificate', 'Career Accelerator Program Certificate')),
  status text not null default 'Not Eligible' check (status in ('Not Eligible', 'For Review', 'Approved', 'Issued')),
  issued_date date,
  certificate_number text,
  issued_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificates_student_type_key unique (student_id, certificate_type)
);

create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  note text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

insert into public.course_groups (code, name, program_type, status)
values
  ('USBK', 'US Bookkeeping', 'Intensive Training', 'Active'),
  ('AUBK', 'AU Bookkeeping', 'Intensive Training', 'Active'),
  ('MEDVA', 'Medical Virtual Assistant', 'Intensive Training', 'Active'),
  ('REVA', 'Real Estate Virtual Assistant', 'Intensive Training', 'Active'),
  ('CAP USBK', 'Career Accelerator Program for US Bookkeeping', 'Career Accelerator', 'Active'),
  ('CAP AUBK', 'Career Accelerator Program for AU Bookkeeping', 'Career Accelerator', 'Active'),
  ('CAP MEDVA', 'Career Accelerator Program for Medical VA', 'Career Accelerator', 'Active'),
  ('CAP REVA', 'Career Accelerator Program for Real Estate VA', 'Career Accelerator', 'Active')
on conflict (code) do update
set name = excluded.name,
    program_type = excluded.program_type;

with activity_seed(activity_track, course_code, sort_order, name) as (
  values
    ('Intensive', 'AUBK', 1, 'Xero Activity 1 - Asset, Liability, Income, Capital, Expense'),
    ('Intensive', 'AUBK', 2, 'Xero Activity 2 - Chart of Accounts and Journal Entry'),
    ('Intensive', 'AUBK', 3, 'Xero Activity 3 - Chart of Accounts: Accounts Creation'),
    ('Intensive', 'AUBK', 4, 'Xero Activity 4 & 5 - Products and Services'),
    ('Intensive', 'AUBK', 5, 'Xero Activity 6 - Purchases (Bills)'),
    ('Intensive', 'AUBK', 6, 'Xero Activity 7 - More Bills To Record'),
    ('Intensive', 'AUBK', 7, 'Xero Activity 8 - Reconciliation and Report'),
    ('Intensive', 'AUBK', 8, 'Xero Final Activity - Invoice, Bills, Reconciliation, and Report'),
    ('Intensive', 'AUBK', 9, 'Sync2VA Xero Assessment'),
    ('Intensive', 'MEDVA', 1, 'Assignment 1 - Mastering Basic Digital Tools'),
    ('Intensive', 'MEDVA', 2, 'Assignment 2 - Typing Test & EHR'),
    ('Intensive', 'MEDVA', 3, 'Assignment 3 - Insurance Terminologies'),
    ('Intensive', 'MEDVA', 4, 'Assignment 4 - Research'),
    ('Intensive', 'MEDVA', 5, 'Assignment 5 - Insurance Computations'),
    ('Intensive', 'MEDVA', 6, 'Assignment 6 - Referral'),
    ('Intensive', 'MEDVA', 7, 'Assignment 7 - MRR'),
    ('Intensive', 'MEDVA', 8, 'Assignment 8 - Transcription'),
    ('Intensive', 'MEDVA', 9, 'Assignment 9 - Scribing'),
    ('Intensive', 'MEDVA', 10, 'Final - Evaluation'),
    ('Intensive', 'REVA', 1, 'Activity 1 - Practice MLS Activity'),
    ('Intensive', 'REVA', 2, 'Activity 2 - Rental Properties & Vendor Research'),
    ('Intensive', 'REVA', 3, 'Activity 3 - PMVA Accounting Activity'),
    ('Intensive', 'REVA', 4, 'Activity 4 - Tenant Background Report'),
    ('Intensive', 'REVA', 5, 'Activity 5 - Comparative Market Analysis'),
    ('Intensive', 'REVA', 6, 'Activity 6 - Open House Poster'),
    ('Intensive', 'REVA', 7, 'Activity 7 - Property Search (Buyer''s Side)'),
    ('Intensive', 'REVA', 8, 'Activity 8 - TXN Calendar Scheduling'),
    ('Intensive', 'USBK', 1, 'Day 2 - ALICE'),
    ('Intensive', 'USBK', 2, 'Day 2 - Debit/Credit'),
    ('Intensive', 'USBK', 3, 'Day 2 - Journal Entry'),
    ('Intensive', 'USBK', 4, 'Day 2 - Journal, Posting and Trial Balance'),
    ('Intensive', 'USBK', 5, 'Day 3 - Chart of Accounts'),
    ('Intensive', 'USBK', 6, 'Day 4 - Products and Services'),
    ('Intensive', 'USBK', 7, 'Day 5 - Expenses, Bills and Bills Payment'),
    ('Intensive', 'USBK', 8, 'Day 6 - Sales Receipt, Invoice and Invoice Payment'),
    ('Intensive', 'USBK', 9, 'Day 7 - Transfer, Journal Entry and Deposit'),
    ('Intensive', 'USBK', 10, 'Day 8 - Bank Statements'),
    ('Intensive', 'USBK', 11, 'Day 8 - Bank Transactions'),
    ('Intensive', 'USBK', 12, 'Day 9 - Reconciliation'),
    ('Intensive', 'USBK', 13, 'Day 10 - Reports'),
    ('CAP', null, 1, 'ATS Resume Creation'),
    ('CAP', null, 2, 'Resume Optimization'),
    ('CAP', null, 3, 'Interview Practice'),
    ('CAP', null, 4, 'Mock Interview'),
    ('CAP', null, 5, 'Mock Call'),
    ('CAP', null, 6, 'Client Communication Practice'),
    ('CAP', null, 7, 'Job Application Readiness')
),
resolved_seed as (
  select cg.id as course_group_id, s.activity_track, s.name, s.sort_order
  from activity_seed s
  left join public.course_groups cg on cg.code = s.course_code
)
insert into public.activities (course_group_id, activity_track, name, sort_order, is_active)
select course_group_id, activity_track, name, sort_order, true
from resolved_seed
on conflict (name) do update
set course_group_id = excluded.course_group_id,
    activity_track = excluded.activity_track,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Automatic timestamps and student defaults
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'course_groups', 'batches', 'students', 'finance_records', 'admin_records',
    'classroom_records', 'activities', 'student_activities', 'requirements',
    'certificates', 'student_notes'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

create or replace function public.calculate_requirement_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.attendance_status = 'Met'
     and new.activity_score_status = 'Passed'
     and new.readiness_status = 'Ready'
     and new.coach_approval = 'Approved'
     and new.admin_clearance = 'Cleared'
     and new.finance_clearance = 'Cleared' then
    new.overall_status = 'Certificate Ready';
  elsif new.attendance_status = 'Not Met'
     or new.activity_score_status = 'Failed'
     or new.readiness_status = 'Not Ready'
     or new.coach_approval = 'Not Approved'
     or new.admin_clearance = 'Hold'
     or new.finance_clearance = 'Hold' then
    new.overall_status = 'Not Ready';
  else
    new.overall_status = 'For Review';
  end if;
  return new;
end;
$$;

drop trigger if exists calculate_requirements_before_write on public.requirements;
create trigger calculate_requirements_before_write
before insert or update on public.requirements
for each row execute function public.calculate_requirement_status();

create or replace function public.initialize_student_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_course_code text;
begin
  select regexp_replace(code, '^CAP[[:space:]]+', '')
  into base_course_code
  from public.course_groups
  where id = new.course_group_id;

  insert into public.finance_records (student_id) values (new.id)
  on conflict (student_id) do nothing;

  insert into public.admin_records (student_id) values (new.id)
  on conflict (student_id) do nothing;

  insert into public.classroom_records (student_id) values (new.id)
  on conflict (student_id) do nothing;

  insert into public.requirements (student_id) values (new.id)
  on conflict (student_id) do nothing;

  insert into public.certificates (student_id, certificate_type)
  values
    (new.id, 'Intensive Training Certificate'),
    (new.id, 'Career Accelerator Program Certificate')
  on conflict (student_id, certificate_type) do nothing;

  insert into public.student_activities (student_id, activity_id)
  select new.id, a.id
  from public.activities a
  left join public.course_groups activity_course on activity_course.id = a.course_group_id
  where a.is_active = true
    and (
      (
        a.activity_track = 'Intensive'
        and (a.course_group_id is null or activity_course.code = base_course_code)
      )
      or (
        a.activity_track = 'CAP'
        and new.training_plan = '1 Month'
      )
    )
  on conflict (student_id, activity_id) do nothing;

  return new;
end;
$$;

drop trigger if exists initialize_student_after_insert on public.students;
create trigger initialize_student_after_insert
after insert on public.students
for each row execute function public.initialize_student_defaults();

drop trigger if exists initialize_student_after_course_change on public.students;
drop trigger if exists initialize_student_after_plan_or_course_change on public.students;
create trigger initialize_student_after_plan_or_course_change
after update of course_group_id, training_plan on public.students
for each row
when (
  old.course_group_id is distinct from new.course_group_id
  or old.training_plan is distinct from new.training_plan
)
execute function public.initialize_student_defaults();

-- Ensure defaults also exist for students added before this schema version.
insert into public.finance_records (student_id)
select id from public.students
on conflict (student_id) do nothing;

insert into public.admin_records (student_id)
select id from public.students
on conflict (student_id) do nothing;

insert into public.classroom_records (student_id)
select id from public.students
on conflict (student_id) do nothing;

insert into public.requirements (student_id)
select id from public.students
on conflict (student_id) do nothing;

insert into public.certificates (student_id, certificate_type)
select s.id, types.certificate_type
from public.students s
cross join (values
  ('Intensive Training Certificate'),
  ('Career Accelerator Program Certificate')
) as types(certificate_type)
on conflict (student_id, certificate_type) do nothing;

insert into public.student_activities (student_id, activity_id)
select s.id, a.id
from public.students s
join public.course_groups student_course on student_course.id = s.course_group_id
cross join public.activities a
left join public.course_groups activity_course on activity_course.id = a.course_group_id
where a.is_active = true
  and (
    (
      a.activity_track = 'Intensive'
      and (
        a.course_group_id is null
        or activity_course.code = regexp_replace(student_course.code, '^CAP[[:space:]]+', '')
      )
    )
    or (
      a.activity_track = 'CAP'
      and s.training_plan = '1 Month'
    )
  )
on conflict (student_id, activity_id) do nothing;

-- ---------------------------------------------------------------------------
-- Indexes for 600+ student search, filters, and reporting
-- ---------------------------------------------------------------------------

create index if not exists students_course_group_idx on public.students(course_group_id);
create index if not exists students_batch_idx on public.students(batch_id);
create index if not exists students_training_plan_idx on public.students(training_plan);
create index if not exists students_updated_at_idx on public.students(updated_at desc);
create index if not exists students_first_name_trgm_idx on public.students using gin (lower(first_name) gin_trgm_ops);
create index if not exists students_last_name_trgm_idx on public.students using gin (lower(last_name) gin_trgm_ops);
create index if not exists students_email_trgm_idx on public.students using gin (lower(email) gin_trgm_ops);
create index if not exists students_phone_trgm_idx on public.students using gin (phone gin_trgm_ops);
create index if not exists activities_course_group_idx on public.activities(course_group_id, sort_order);
create index if not exists activities_track_idx on public.activities(activity_track, sort_order);
create index if not exists batches_period_idx on public.batches(year desc, month desc, batch_number);
create index if not exists batches_status_idx on public.batches(status);
create index if not exists finance_payment_status_idx on public.finance_records(payment_status);
create index if not exists admin_student_status_idx on public.admin_records(student_status);
create index if not exists admin_concern_status_idx on public.admin_records(concern_status);
create index if not exists classroom_invite_status_idx on public.classroom_records(invite_status);
create index if not exists student_activities_student_idx on public.student_activities(student_id);
create index if not exists student_activities_status_idx on public.student_activities(status);
create index if not exists requirements_overall_idx on public.requirements(overall_status);
create index if not exists certificates_status_idx on public.certificates(status);
create index if not exists certificates_number_idx on public.certificates(certificate_number);
create index if not exists student_notes_student_created_idx on public.student_notes(student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security: authenticated users can operate the CRM.
-- Tighten these policies later if your team needs role-specific permissions.
-- ---------------------------------------------------------------------------

alter table public.course_groups enable row level security;
alter table public.batches enable row level security;
alter table public.students enable row level security;
alter table public.finance_records enable row level security;
alter table public.admin_records enable row level security;
alter table public.classroom_records enable row level security;
alter table public.activities enable row level security;
alter table public.student_activities enable row level security;
alter table public.requirements enable row level security;
alter table public.certificates enable row level security;
alter table public.student_notes enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'course_groups', 'batches', 'students', 'finance_records', 'admin_records',
    'classroom_records', 'activities', 'student_activities', 'requirements',
    'certificates', 'student_notes'
  ]
  loop
    execute format('drop policy if exists "Authenticated users can view" on public.%I', table_name);
    execute format('drop policy if exists "Authenticated users can insert" on public.%I', table_name);
    execute format('drop policy if exists "Authenticated users can update" on public.%I', table_name);
    execute format('drop policy if exists "Authenticated users can delete" on public.%I', table_name);

    execute format(
      'create policy "Authenticated users can view" on public.%I for select to authenticated using (true)',
      table_name
    );
    execute format(
      'create policy "Authenticated users can insert" on public.%I for insert to authenticated with check (true)',
      table_name
    );
    execute format(
      'create policy "Authenticated users can update" on public.%I for update to authenticated using (true) with check (true)',
      table_name
    );
    execute format(
      'create policy "Authenticated users can delete" on public.%I for delete to authenticated using (true)',
      table_name
    );
  end loop;
end;
$$;

commit;
