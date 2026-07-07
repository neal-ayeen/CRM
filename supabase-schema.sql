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
  training_access_status text not null default 'Active'
    check (training_access_status in ('Active', 'Payment Watch', 'Payment Hold', 'Remove from Training', 'Fully Paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students add column if not exists training_plan text;
alter table public.students add column if not exists training_access_status text;
update public.students set training_plan = '2 Weeks' where training_plan is null;
update public.students set training_access_status = 'Active' where training_access_status is null;
alter table public.students alter column training_plan set default '2 Weeks';
alter table public.students alter column training_plan set not null;
alter table public.students alter column training_access_status set default 'Active';
alter table public.students alter column training_access_status set not null;
do $$
begin
  alter table public.students drop constraint if exists students_training_access_status_check;
  if not exists (
    select 1 from pg_constraint
    where conname = 'students_training_plan_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_training_plan_check check (training_plan in ('2 Weeks', '1 Month'));
  end if;
  alter table public.students
    add constraint students_training_access_status_check
    check (training_access_status in ('Active', 'Payment Watch', 'Payment Hold', 'Remove from Training', 'Fully Paid'));
end;
$$;

create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  payment_status text not null default 'Pending Deposit'
    check (payment_status in (
      'Pending Deposit', 'Deposit Paid', 'Partial Payment', 'Fully Paid',
      'Payment Watch', 'Overdue', 'Payment Hold', 'Refund Requested',
      'Refunded', 'Cancelled'
    )),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance numeric(12,2) not null default 0 check (balance >= 0),
  payment_method text default 'UnionBank' check (payment_method is null or payment_method in ('UnionBank', 'GCash', 'Bank Transfer', 'PayPal', 'Cash', 'Other')),
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
  status text not null default 'Not Started' check (status in ('Not Started', 'Submitted', 'Passed', 'Returned', 'Failed')),
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
-- Sync2VA operational upgrades: roles, sources, pricing, payments, attendance.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'Admin'
    check (role in ('Super Admin', 'Admin', 'Finance', 'Coach')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_discount_type text not null default 'None'
    check (default_discount_type in ('None', 'Percentage', 'Fixed', 'Custom')),
  default_discount_amount numeric(12,2) not null default 0 check (default_discount_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrollment_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  source_id uuid references public.student_sources(id) on delete set null,
  source_name text,
  regular_price numeric(12,2) not null default 0 check (regular_price >= 0),
  discount_type text not null default 'None'
    check (discount_type in ('None', 'Referral', 'Webinar', 'Fixed', 'Percentage', 'Custom')),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  final_price numeric(12,2) not null default 0 check (final_price >= 0),
  enrollment_status text not null default 'Pending Deposit'
    check (enrollment_status in ('Pending Deposit', 'Officially Enrolled', 'Cancelled', 'Completed')),
  messenger_group_added boolean not null default false,
  finance_exception_approved boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  plan_type text not null default 'Full Payment'
    check (plan_type in ('Full Payment', 'Standard Staggered', 'Custom Staggered')),
  number_of_payments smallint not null default 1 check (number_of_payments between 1 and 5),
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  total_contract_amount numeric(12,2) not null default 0 check (total_contract_amount >= 0),
  total_paid numeric(12,2) not null default 0 check (total_paid >= 0),
  balance numeric(12,2) not null default 0 check (balance >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_installments (
  id uuid primary key default gen_random_uuid(),
  payment_plan_id uuid references public.payment_plans(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  installment_number smallint not null check (installment_number between 1 and 5),
  label text,
  due_date date,
  amount_due numeric(12,2) not null default 0 check (amount_due >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  payment_status text not null default 'Pending'
    check (payment_status in ('Pending', 'Partial', 'Paid', 'Overdue', 'Waived', 'Refunded')),
  payment_method text,
  unionbank_reference text,
  payment_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_installments_plan_number_key unique (payment_plan_id, installment_number)
);

create table if not exists public.coach_batch_assignments (
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_user_id, batch_id)
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  title text not null,
  session_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'Present'
    check (status in ('Present', 'Late', 'Absent', 'Excused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_session_student_key unique (session_id, student_id)
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  batch_id uuid references public.batches(id) on delete set null,
  recipients text[] not null default '{}',
  template text,
  subject text not null,
  body text not null,
  status text not null default 'Logged'
    check (status in ('Draft', 'Logged', 'Queued', 'Sent', 'Failed')),
  sent_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_records add column if not exists training_access_status text;
alter table public.finance_records add column if not exists unionbank_reference text;
alter table public.finance_records add column if not exists due_date date;
alter table public.finance_records add column if not exists refund_requested boolean not null default false;
alter table public.finance_records add column if not exists refund_status text not null default 'None';
alter table public.finance_records add column if not exists refund_reason text;
alter table public.finance_records add column if not exists refund_date date;

alter table public.classroom_records add column if not exists joined_status text;
alter table public.classroom_records add column if not exists final_coach_recommendation text;
alter table public.classroom_records add column if not exists coach_comment text;

alter table public.student_activities add column if not exists coach_comment text;

do $$
begin
  alter table public.finance_records drop constraint if exists finance_records_payment_status_check;
  alter table public.finance_records drop constraint if exists finance_records_payment_method_check;
  alter table public.finance_records drop constraint if exists finance_records_training_access_status_check;
  alter table public.finance_records drop constraint if exists finance_records_refund_status_check;
  alter table public.student_activities drop constraint if exists student_activities_status_check;
  alter table public.classroom_records drop constraint if exists classroom_records_joined_status_check;
  alter table public.classroom_records drop constraint if exists classroom_records_final_coach_recommendation_check;
end;
$$;

update public.finance_records
set payment_status = case payment_status
  when 'Pending Payment' then 'Pending Deposit'
  when 'Downpayment Paid' then 'Deposit Paid'
  else payment_status
end;

update public.student_activities
set status = case status
  when 'Pending' then 'Not Started'
  when 'Pass' then 'Passed'
  when 'Fail' then 'Failed'
  when 'Retake' then 'Returned'
  else status
end;

update public.finance_records
set training_access_status = case
  when training_access_status is not null then training_access_status
  when payment_status = 'Fully Paid' then 'Fully Paid'
  when payment_status in ('Payment Hold', 'Overdue') then 'Payment Hold'
  when payment_status = 'Payment Watch' then 'Payment Watch'
  when payment_status = 'Cancelled' then 'Remove from Training'
  else 'Active'
end;

update public.students s
set training_access_status = coalesce(f.training_access_status, 'Active')
from public.finance_records f
where f.student_id = s.id;

alter table public.finance_records alter column payment_status set default 'Pending Deposit';
alter table public.finance_records alter column payment_method set default 'UnionBank';
alter table public.finance_records alter column refund_status set default 'None';
alter table public.finance_records alter column training_access_status set default 'Active';
alter table public.student_activities alter column status set default 'Not Started';
alter table public.classroom_records alter column joined_status set default 'Pending';
alter table public.classroom_records alter column final_coach_recommendation set default 'Incomplete';

alter table public.finance_records
  add constraint finance_records_payment_status_check
  check (payment_status in (
    'Pending Deposit', 'Deposit Paid', 'Partial Payment', 'Fully Paid',
    'Payment Watch', 'Overdue', 'Payment Hold', 'Refund Requested',
    'Refunded', 'Cancelled'
  ));

alter table public.finance_records
  add constraint finance_records_payment_method_check
  check (payment_method is null or payment_method in ('UnionBank', 'GCash', 'Bank Transfer', 'PayPal', 'Cash', 'Other'));

alter table public.finance_records
  add constraint finance_records_training_access_status_check
  check (training_access_status in ('Active', 'Payment Watch', 'Payment Hold', 'Remove from Training', 'Fully Paid'));

alter table public.finance_records
  add constraint finance_records_refund_status_check
  check (refund_status in ('None', 'Requested', 'Approved', 'Processing', 'Refunded', 'Rejected'));

alter table public.student_activities
  add constraint student_activities_status_check
  check (status in ('Not Started', 'Submitted', 'Passed', 'Returned', 'Failed'));

alter table public.classroom_records
  add constraint classroom_records_joined_status_check
  check (joined_status is null or joined_status in ('Yes', 'No', 'Pending'));

alter table public.classroom_records
  add constraint classroom_records_final_coach_recommendation_check
  check (final_coach_recommendation is null or final_coach_recommendation in ('Passed', 'Failed', 'Incomplete'));

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

insert into public.student_sources (name, default_discount_type, default_discount_amount, is_active)
values
  ('Facebook / Social Media', 'None', 0, true),
  ('Referral', 'Custom', 0, true),
  ('Webinar', 'Fixed', 0, true),
  ('Other', 'None', 0, true)
on conflict (name) do update
set default_discount_type = excluded.default_discount_type,
    default_discount_amount = excluded.default_discount_amount,
    is_active = true,
    updated_at = now();

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
    'profiles', 'student_sources', 'course_groups', 'batches', 'students', 'finance_records', 'admin_records',
    'classroom_records', 'activities', 'student_activities', 'requirements',
    'certificates', 'student_notes', 'enrollment_records', 'payment_plans',
    'payment_installments', 'attendance_sessions', 'attendance_records', 'email_logs'
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

create or replace function public.sync_student_training_access_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students
  set training_access_status = coalesce(new.training_access_status, 'Active')
  where id = new.student_id;
  return new;
end;
$$;

drop trigger if exists sync_student_training_access_status_after_write on public.finance_records;
create trigger sync_student_training_access_status_after_write
after insert or update of training_access_status on public.finance_records
for each row execute function public.sync_student_training_access_status();

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

  insert into public.enrollment_records (student_id, source_name, enrollment_status)
  values (new.id, 'Other', 'Pending Deposit')
  on conflict (student_id) do nothing;

  insert into public.payment_plans (student_id, plan_type, number_of_payments)
  values (new.id, 'Full Payment', 1)
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

insert into public.enrollment_records (student_id, source_name, enrollment_status)
select id, 'Other', 'Pending Deposit' from public.students
on conflict (student_id) do nothing;

insert into public.payment_plans (student_id, plan_type, number_of_payments)
select id, 'Full Payment', 1 from public.students
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
create index if not exists students_training_access_idx on public.students(training_access_status);
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
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists enrollment_records_source_idx on public.enrollment_records(source_id, source_name);
create index if not exists enrollment_records_status_idx on public.enrollment_records(enrollment_status);
create index if not exists finance_training_access_idx on public.finance_records(training_access_status);
create index if not exists finance_refund_status_idx on public.finance_records(refund_status);
create index if not exists payment_installments_student_idx on public.payment_installments(student_id, due_date);
create index if not exists payment_installments_status_idx on public.payment_installments(payment_status);
create index if not exists coach_batch_assignments_batch_idx on public.coach_batch_assignments(batch_id);
create index if not exists attendance_sessions_batch_date_idx on public.attendance_sessions(batch_id, session_date desc);
create index if not exists attendance_records_student_idx on public.attendance_records(student_id);
create index if not exists email_logs_created_idx on public.email_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security with roles.
-- If profiles is empty, authenticated users keep setup access so you do not
-- lock yourself out. Add profiles rows for real production role enforcement.
-- ---------------------------------------------------------------------------

create or replace function public.no_profiles_yet()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles);
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.is_active = true;
$$;

create or replace function public.has_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.no_profiles_yet()
    or coalesce(public.current_user_role() = any(required_roles), false);
$$;

create or replace function public.can_access_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.no_profiles_yet()
    or coalesce(public.current_user_role() = any(array['Super Admin','Admin','Finance']), false)
    or (
      public.current_user_role() = 'Coach'
      and exists (
        select 1
        from public.coach_batch_assignments cba
        where cba.coach_user_id = auth.uid()
          and cba.batch_id = target_batch_id
      )
    );
$$;

create or replace function public.can_access_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.no_profiles_yet()
    or coalesce(public.current_user_role() = any(array['Super Admin','Admin','Finance']), false)
    or (
      public.current_user_role() = 'Coach'
      and exists (
        select 1
        from public.students s
        join public.coach_batch_assignments cba on cba.batch_id = s.batch_id
        where s.id = target_student_id
          and cba.coach_user_id = auth.uid()
      )
    );
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'student_sources', 'course_groups', 'batches', 'students',
    'finance_records', 'admin_records', 'classroom_records', 'activities',
    'student_activities', 'requirements', 'certificates', 'student_notes',
    'enrollment_records', 'payment_plans', 'payment_installments',
    'coach_batch_assignments', 'attendance_sessions', 'attendance_records',
    'email_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Authenticated users can view" on public.%I', table_name);
    execute format('drop policy if exists "Authenticated users can insert" on public.%I', table_name);
    execute format('drop policy if exists "Authenticated users can update" on public.%I', table_name);
    execute format('drop policy if exists "Authenticated users can delete" on public.%I', table_name);
    execute format('drop policy if exists "Role select" on public.%I', table_name);
    execute format('drop policy if exists "Role insert" on public.%I', table_name);
    execute format('drop policy if exists "Role update" on public.%I', table_name);
    execute format('drop policy if exists "Role delete" on public.%I', table_name);
  end loop;
end;
$$;

create policy "Role select" on public.profiles
for select to authenticated
using (public.no_profiles_yet() or user_id = auth.uid() or public.has_role(array['Super Admin','Admin']));
create policy "Role insert" on public.profiles
for insert to authenticated
with check (public.no_profiles_yet() or public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.profiles
for update to authenticated
using (public.has_role(array['Super Admin','Admin']))
with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.profiles
for delete to authenticated
using (public.has_role(array['Super Admin']));

create policy "Role select" on public.student_sources for select to authenticated using (true);
create policy "Role insert" on public.student_sources for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.student_sources for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.student_sources for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.course_groups for select to authenticated using (true);
create policy "Role insert" on public.course_groups for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.course_groups for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.course_groups for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.batches for select to authenticated using (public.has_role(array['Super Admin','Admin','Finance']) or public.can_access_batch(id));
create policy "Role insert" on public.batches for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.batches for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.batches for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.students for select to authenticated using (public.can_access_student(id));
create policy "Role insert" on public.students for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.students for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.students for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.finance_records for select to authenticated using (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role insert" on public.finance_records for insert to authenticated with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role update" on public.finance_records for update to authenticated using (public.has_role(array['Super Admin','Admin','Finance'])) with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role delete" on public.finance_records for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.admin_records for select to authenticated using (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role insert" on public.admin_records for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.admin_records for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.admin_records for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.classroom_records for select to authenticated using (public.can_access_student(student_id));
create policy "Role insert" on public.classroom_records for insert to authenticated with check (public.has_role(array['Super Admin','Admin']) or public.can_access_student(student_id));
create policy "Role update" on public.classroom_records for update to authenticated using (public.has_role(array['Super Admin','Admin']) or public.can_access_student(student_id)) with check (public.has_role(array['Super Admin','Admin']) or public.can_access_student(student_id));
create policy "Role delete" on public.classroom_records for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.activities for select to authenticated using (true);
create policy "Role insert" on public.activities for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.activities for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.activities for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.student_activities for select to authenticated using (public.can_access_student(student_id));
create policy "Role insert" on public.student_activities for insert to authenticated with check (public.has_role(array['Super Admin','Admin']) or public.can_access_student(student_id));
create policy "Role update" on public.student_activities for update to authenticated using (public.has_role(array['Super Admin','Admin']) or public.can_access_student(student_id)) with check (public.has_role(array['Super Admin','Admin']) or public.can_access_student(student_id));
create policy "Role delete" on public.student_activities for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.requirements for select to authenticated using (public.can_access_student(student_id));
create policy "Role insert" on public.requirements for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.requirements for update to authenticated using (public.has_role(array['Super Admin','Admin','Finance'])) with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role delete" on public.requirements for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.certificates for select to authenticated using (public.can_access_student(student_id));
create policy "Role insert" on public.certificates for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.certificates for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.certificates for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.student_notes for select to authenticated using (public.can_access_student(student_id));
create policy "Role insert" on public.student_notes for insert to authenticated with check (public.can_access_student(student_id));
create policy "Role update" on public.student_notes for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.student_notes for delete to authenticated using (public.has_role(array['Super Admin','Admin']));

create policy "Role select" on public.enrollment_records for select to authenticated using (public.has_role(array['Super Admin','Admin','Finance']) or public.can_access_student(student_id));
create policy "Role insert" on public.enrollment_records for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.enrollment_records for update to authenticated using (public.has_role(array['Super Admin','Admin','Finance'])) with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role delete" on public.enrollment_records for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.payment_plans for select to authenticated using (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role insert" on public.payment_plans for insert to authenticated with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role update" on public.payment_plans for update to authenticated using (public.has_role(array['Super Admin','Admin','Finance'])) with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role delete" on public.payment_plans for delete to authenticated using (public.has_role(array['Super Admin']));

create policy "Role select" on public.payment_installments for select to authenticated using (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role insert" on public.payment_installments for insert to authenticated with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role update" on public.payment_installments for update to authenticated using (public.has_role(array['Super Admin','Admin','Finance'])) with check (public.has_role(array['Super Admin','Admin','Finance']));
create policy "Role delete" on public.payment_installments for delete to authenticated using (public.has_role(array['Super Admin','Finance']));

create policy "Role select" on public.coach_batch_assignments for select to authenticated using (public.has_role(array['Super Admin','Admin']) or coach_user_id = auth.uid());
create policy "Role insert" on public.coach_batch_assignments for insert to authenticated with check (public.has_role(array['Super Admin','Admin']));
create policy "Role update" on public.coach_batch_assignments for update to authenticated using (public.has_role(array['Super Admin','Admin'])) with check (public.has_role(array['Super Admin','Admin']));
create policy "Role delete" on public.coach_batch_assignments for delete to authenticated using (public.has_role(array['Super Admin','Admin']));

create policy "Role select" on public.attendance_sessions for select to authenticated using (public.can_access_batch(batch_id));
create policy "Role insert" on public.attendance_sessions for insert to authenticated with check (public.can_access_batch(batch_id));
create policy "Role update" on public.attendance_sessions for update to authenticated using (public.can_access_batch(batch_id)) with check (public.can_access_batch(batch_id));
create policy "Role delete" on public.attendance_sessions for delete to authenticated using (public.has_role(array['Super Admin','Admin']));

create policy "Role select" on public.attendance_records for select to authenticated using (
  exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_access_batch(s.batch_id))
);
create policy "Role insert" on public.attendance_records for insert to authenticated with check (
  exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_access_batch(s.batch_id))
);
create policy "Role update" on public.attendance_records for update to authenticated using (
  exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_access_batch(s.batch_id))
) with check (
  exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_access_batch(s.batch_id))
);
create policy "Role delete" on public.attendance_records for delete to authenticated using (public.has_role(array['Super Admin','Admin']));

create policy "Role select" on public.email_logs for select to authenticated using (
  public.has_role(array['Super Admin','Admin','Finance']) or sent_by = auth.uid()
);
create policy "Role insert" on public.email_logs for insert to authenticated with check (public.has_role(array['Super Admin','Admin','Finance','Coach']));
create policy "Role update" on public.email_logs for update to authenticated using (public.has_role(array['Super Admin','Admin']) or sent_by = auth.uid()) with check (public.has_role(array['Super Admin','Admin']) or sent_by = auth.uid());
create policy "Role delete" on public.email_logs for delete to authenticated using (public.has_role(array['Super Admin','Admin']));

-- Supabase API grants. Row Level Security above still controls what each role
-- can actually read or write.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

commit;
