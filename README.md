# Sync2VA Student CRM

A responsive, Supabase-backed student operations CRM built with HTML, CSS, and vanilla JavaScript.

## Setup

1. Create a Supabase project.
2. Open **SQL Editor** in Supabase and run [`supabase-schema.sql`](./supabase-schema.sql).
3. In **Authentication → Users**, create at least one email/password user.
4. Copy `config.js` and add your Supabase Project URL and **public anon key**:

   ```js
   window.SYNC2VA_CONFIG = {
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY"
   };
   ```

   You can alternatively enter these values on the app's setup screen. Only the public connection settings are stored in the browser; CRM records always live in Supabase.

5. Serve the folder with any static web server. For example:

   ```powershell
   python -m http.server 8080
   ```

6. Open `http://localhost:8080` and sign in with the Supabase user.

Do not use a Supabase service role key in this frontend app.

## CSV import

Use this exact header:

```text
first_name,last_name,email,phone,course_group,batch_month,batch_year,batch_number,training_plan,coach,finance_status,student_status
```

- `course_group` must match a configured code such as `USBK` or `CAP USBK`.
- Optional `training_plan` accepts `2 Weeks` or `1 Month`. If omitted, students default to `2 Weeks`.
- `batch_month` accepts a month name, abbreviation, or number.
- `batch_number` must be `1` or `2`.
- Missing batches are created automatically.
- Uploads are inserted in chunks of 200 for large files.
- A database trigger creates finance, admin, classroom, requirement, activity, and two certificate records for each new student.
- `2 Weeks` students receive Intensive activities only. `1 Month` students receive Intensive + CAP activities.
- Duplicate emails are skipped.

## Security notes

- All tables use UUID primary keys and foreign keys.
- Student-related records use `ON DELETE CASCADE`.
- Row-level security permits authenticated users and blocks anonymous access.
- The bundled policy is intentionally team-wide. Add role claims and narrower policies if finance or certificate data should be restricted to specific staff.
- CSV exports contain personal data and should be handled according to your privacy policy.
