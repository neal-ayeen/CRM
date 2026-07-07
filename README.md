# Sync2VA Student CRM

A responsive, Supabase-backed student operations CRM built with vanilla HTML, CSS, and JavaScript.

## Supabase setup - step by step

1. Create or open your Supabase project.
2. Go to **SQL Editor**.
3. Open `supabase-schema.sql` from this folder.
4. Copy the full SQL file, paste it into the Supabase SQL Editor, and click **Run**.
5. Go to **Project Settings > API**.
6. Copy your **Project URL**.
7. Copy your public **anon** / **publishable** key. Do not copy the service role key.
8. Open `config.js` and replace the placeholders:

   ```js
   window.SYNC2VA_CONFIG = {
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabaseAnonKey: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY"
   };
   ```

9. Go to **Authentication > Users** and create the login users.
10. Go to **Table Editor > profiles** and add one row per Auth user:

   - `Super Admin` - full access
   - `Admin` - students, batches, coach updates, certificates, reports, partial finance visibility
   - `Finance` - finance, payments, refunds, balances, due dates
   - `Coach` - assigned batches/students, classroom, attendance, activity scores/comments, limited training access status

11. For every coach, add their assigned batches in `coach_batch_assignments`.
12. Sign in to the CRM and upload/import students.

Never use a Supabase service role key in this frontend app.

## GitHub Pages setup - step by step

1. Create a new GitHub repository, for example `sync2va-student-crm`.
2. Upload these files to the repository root:

   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
   - `supabase-schema.sql`
   - `README.md`

3. Before uploading publicly, confirm `config.js` contains only your public Supabase URL and anon/publishable key.
4. Commit the files to the `main` branch.
5. Go to **Settings > Pages**.
6. Under **Build and deployment**, choose:

   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`

7. Click **Save**.
8. Wait for GitHub Pages to publish the site.
9. Open the GitHub Pages URL and sign in using a Supabase Auth user you created.
10. If sign-in says the Supabase project is not connected, re-check `config.js`, commit the fixed file, and wait for GitHub Pages to redeploy.

## What updates in Supabase

Run `supabase-schema.sql` to add or update:

- Role-aware `profiles`
- Student source tracking
- Enrollment and pricing records
- Finance records with UnionBank reference, refunds, due dates, payment status, and training access status
- Payment plans and installments
- Coach batch assignments
- Attendance sessions and attendance records
- Email logs
- Coach checklist status/comment fields
- Certificate readiness support
- Row Level Security policies for Super Admin, Admin, Finance, and Coach roles

## What updates in GitHub / the website

Upload the updated frontend files to add:

- Dashboard summaries by source, finance status, batch, course, certificate status, and coach progress
- Student profile tabs for Overview, Enrollment and Pricing, Finance, Payment Plan, Admin, Coaches, Attendance, Requirements, Certificates, and Notes
- `2 Weeks` plan logic for Intensive activities only
- `1 Month` plan logic for Intensive + CAP activities
- Finance page with payment holds, payment watch, refunds, due dates, balances, and UnionBank reference
- Coach Checklist page with activity status, comments, final recommendation, and limited finance visibility
- Attendance page
- Email Center page
- Expanded CSV/XLSX import and reports

## Current modules

- Dashboard
- Students
- Course Groups
- Batches
- Finance
- Coach Checklist
- Attendance
- Certificates
- Email Center
- Reports
- Settings

## Student process supported

- Student source: Facebook / Social Media, Referral, Webinar, Other
- Enrollment and pricing: regular price, discount type, discount amount, final price
- Training plan:
  - `2 Weeks` = Intensive activities only
  - `1 Month` = Intensive + CAP activities
- Finance: UnionBank reference, payment status, training access status, refund status, due dates, amount paid, balance
- Payment plans: full payment, standard staggered, custom staggered, up to 5 payments
- Coach checklist: Classroom invite/joined status, activity status, score, coach comment, final recommendation
- Attendance: batch sessions with Present, Late, Absent, Excused
- Email Center: logs emails and templates now; direct sending is a TODO for Supabase Edge Function/SMTP

## Student import - CSV or XLSX

Required columns:

```text
first_name,last_name,email,course_group,batch_month,batch_year,batch_number
```

Recommended full header:

```text
first_name,last_name,phone,email,course_group,batch_month,batch_year,batch_number,regular_price,training_plan,Referred By,source,final_price,deposit_amount,finance_status,training_access_status,messenger_group_added,coach,student_status
```

Notes:

- You can upload the prepared `try.xlsx` bridge file directly, or save it as CSV.
- The Monday.com raw export should first be copied into the bridge/import format.
- `training_plan` accepts `2 Weeks` or `1 Month`.
- `source` accepts Facebook/Social Media, Referral, Webinar, or Other.
- `finance_status` accepts Pending Deposit, Deposit Paid, Partial Payment, Fully Paid, Payment Watch, Overdue, Payment Hold, Refund Requested, Refunded, Cancelled.
- If `finance_status` is blank, the importer uses `Pending Deposit`.
- `training_access_status` accepts Active, Payment Watch, Payment Hold, Remove from Training, Fully Paid. It also accepts `Yes` as `Active` and `No` as `Payment Hold`.
- If `final_price` is blank, the importer uses `regular_price`.
- The import template intentionally does not include `discount_type`, `discount_amount`, `payment_plan_type`, or `number_of_payments`; update those manually inside the student profile when needed.
- Missing batches are created automatically.
- Duplicate emails are skipped.

## Email sending TODO

The Email Center currently writes to `email_logs`. To send real emails, create a Supabase Edge Function or other backend service using SMTP/API credentials stored as server-side secrets. Do not put SMTP passwords or service role keys in `config.js`.

## Security notes

- The app uses the public anon/publishable key only.
- Supabase RLS is role-aware through `profiles`.
- If `profiles` is empty, a temporary setup fallback allows authenticated access so you do not lock yourself out.
- Once profiles are created, coaches only see assigned batches/students and limited training access status, not exact payment amounts.
