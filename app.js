/* Sync2VA Student CRM — Supabase-backed vanilla JavaScript application */
"use strict";

const APP = {
  name: "Sync2VA Student CRM",
  pageSize: 25,
  courseCodes: ["USBK", "AUBK", "MEDVA", "REVA", "CAP USBK", "CAP AUBK", "CAP MEDVA", "CAP REVA"],
  months: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ],
  financeStatuses: ["Pending Payment", "Downpayment Paid", "Fully Paid", "Refunded"],
  studentStatuses: ["Active", "Inactive", "Dropped", "Completed", "On Hold"],
  certificateStatuses: ["Not Eligible", "For Review", "Approved", "Issued"],
  activityStatuses: ["Pending", "Pass", "Fail", "Retake"],
  planOptions: ["2 Weeks", "1 Month"],
  defaultActivities: {
    AUBK: [
      "Xero Activity 1 - Asset, Liability, Income, Capital, Expense",
      "Xero Activity 2 - Chart of Accounts and Journal Entry",
      "Xero Activity 3 - Chart of Accounts: Accounts Creation",
      "Xero Activity 4 & 5 - Products and Services",
      "Xero Activity 6 - Purchases (Bills)",
      "Xero Activity 7 - More Bills To Record",
      "Xero Activity 8 - Reconciliation and Report",
      "Xero Final Activity - Invoice, Bills, Reconciliation, and Report",
      "Sync2VA Xero Assessment"
    ],
    MEDVA: [
      "Assignment 1 - Mastering Basic Digital Tools",
      "Assignment 2 - Typing Test & EHR",
      "Assignment 3 - Insurance Terminologies",
      "Assignment 4 - Research",
      "Assignment 5 - Insurance Computations",
      "Assignment 6 - Referral",
      "Assignment 7 - MRR",
      "Assignment 8 - Transcription",
      "Assignment 9 - Scribing",
      "Final - Evaluation"
    ],
    REVA: [
      "Activity 1 - Practice MLS Activity",
      "Activity 2 - Rental Properties & Vendor Research",
      "Activity 3 - PMVA Accounting Activity",
      "Activity 4 - Tenant Background Report",
      "Activity 5 - Comparative Market Analysis",
      "Activity 6 - Open House Poster",
      "Activity 7 - Property Search (Buyer's Side)",
      "Activity 8 - TXN Calendar Scheduling"
    ],
    USBK: [
      "Day 2 - ALICE",
      "Day 2 - Debit/Credit",
      "Day 2 - Journal Entry",
      "Day 2 - Journal, Posting and Trial Balance",
      "Day 3 - Chart of Accounts",
      "Day 4 - Products and Services",
      "Day 5 - Expenses, Bills and Bills Payment",
      "Day 6 - Sales Receipt, Invoice and Invoice Payment",
      "Day 7 - Transfer, Journal Entry and Deposit",
      "Day 8 - Bank Statements",
      "Day 8 - Bank Transactions",
      "Day 9 - Reconciliation",
      "Day 10 - Reports"
    ],
    CAP: [
      "ATS Resume Creation",
      "Resume Optimization",
      "Interview Practice",
      "Mock Interview",
      "Mock Call",
      "Client Communication Practice",
      "Job Application Readiness"
    ]
  }
};

const state = {
  supabase: null,
  session: null,
  route: "dashboard",
  courseGroups: [],
  batches: [],
  activities: [],
  selectedStudents: new Set(),
  studentsPage: 1,
  studentFilters: {},
  dashboardFilters: {},
  profile: null,
  profileTab: "overview",
  lastStudentQuery: [],
  loading: false
};

const pageMeta = {
  dashboard: ["Dashboard", "Student operations"],
  students: ["Students", "Enrollment records"],
  "course-groups": ["Course Groups", "Program structure"],
  batches: ["Batches", "Cohort management"],
  finance: ["Finance", "Payment tracking"],
  "coach-checklist": ["Coach Checklist", "Student readiness"],
  certificates: ["Certificates", "Completion workflow"],
  reports: ["Reports", "Data exports"],
  settings: ["Settings", "Workspace configuration"]
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderIcons(document);
  bindShellEvents();
  const config = getSupabaseConfig();
  if (!config.url || !config.key) {
    showAuthScreen("Connect your Supabase project before signing in.");
    return;
  }
  try {
    createSupabaseClient(config.url, config.key);
    const { data: { session } } = await state.supabase.auth.getSession();
    state.session = session;
    state.supabase.auth.onAuthStateChange((_event, nextSession) => {
      state.session = nextSession;
      if (!nextSession) showAuthScreen();
    });
    if (session) {
      await enterApp();
    } else {
      showAuthScreen();
    }
  } catch (error) {
    showAuthScreen(`Connection setup needs attention: ${friendlyError(error)}`);
  }
}

function getSupabaseConfig() {
  const fileConfig = window.SYNC2VA_CONFIG || {};
  return {
    url: fileConfig.supabaseUrl || localStorage.getItem("sync2va_supabase_url") || "",
    key: fileConfig.supabaseAnonKey || localStorage.getItem("sync2va_supabase_anon_key") || ""
  };
}

function createSupabaseClient(url, key) {
  if (!window.supabase?.createClient) throw new Error("Supabase library did not load.");
  state.supabase = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

function showAuthScreen(message = "") {
  $("#app-shell").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
  const alert = $("#connection-warning");
  alert.textContent = message;
  alert.classList.toggle("hidden", !message);
}

async function enterApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  updateUserChip();
  await loadLookups();
  routeFromHash();
}

async function loadLookups() {
  const [courseResult, batchResult, activitiesResult] = await Promise.all([
    state.supabase.from("course_groups").select("*").order("code"),
    state.supabase.from("batches").select("*, course_group:course_groups(id,code,name)").order("year", { ascending: false }).order("month", { ascending: false }).order("batch_number"),
    state.supabase.from("activities").select("*").eq("is_active", true).order("sort_order")
  ]);
  if (courseResult.error) throw courseResult.error;
  if (batchResult.error) throw batchResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  state.courseGroups = courseResult.data || [];
  state.batches = batchResult.data || [];
  state.activities = activitiesResult.data || [];
}

function bindShellEvents() {
  $("#auth-form").addEventListener("submit", handleSignIn);
  $("#show-setup-btn").addEventListener("click", openSetupModal);
  $("#sign-out-btn").addEventListener("click", signOut);
  $("#global-add-student").addEventListener("click", () => openStudentForm());
  $("#sidebar-open").addEventListener("click", () => document.body.classList.add("sidebar-open"));
  $("#sidebar-close").addEventListener("click", closeSidebar);
  $("#sidebar-scrim").addEventListener("click", closeSidebar);
  $("#user-menu-btn").addEventListener("click", () => {
    const menu = $("#user-dropdown");
    menu.classList.toggle("hidden");
    $("#user-menu-btn").setAttribute("aria-expanded", String(!menu.classList.contains("hidden")));
  });
  $("#user-dropdown").addEventListener("click", event => {
    if (event.target.closest("[data-sign-out]")) signOut();
    const jump = event.target.closest("[data-route-jump]")?.dataset.routeJump;
    if (jump) navigate(jump);
  });
  $("#main-nav").addEventListener("click", event => {
    const link = event.target.closest("[data-route]");
    if (!link) return;
    event.preventDefault();
    navigate(link.dataset.route);
    closeSidebar();
  });
  window.addEventListener("hashchange", routeFromHash);
  document.addEventListener("click", event => {
    if (!event.target.closest(".user-menu-wrap")) $("#user-dropdown")?.classList.add("hidden");
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if ($("#modal-root").children.length) closeModal();
      closeSidebar();
    }
  });
}

async function handleSignIn(event) {
  event.preventDefault();
  if (!state.supabase) {
    openSetupModal();
    return;
  }
  const button = $("#sign-in-btn");
  setButtonLoading(button, true, "Signing in…");
  const { data, error } = await state.supabase.auth.signInWithPassword({
    email: $("#auth-email").value.trim(),
    password: $("#auth-password").value
  });
  setButtonLoading(button, false);
  if (error) {
    toast("Could not sign in", friendlyError(error), "error");
    return;
  }
  state.session = data.session;
  await enterApp();
}

async function signOut() {
  if (state.supabase) await state.supabase.auth.signOut();
  state.session = null;
  state.selectedStudents.clear();
  showAuthScreen();
}

function updateUserChip() {
  const email = state.session?.user?.email || "Authenticated user";
  const displayName = state.session?.user?.user_metadata?.full_name || email.split("@")[0].replace(/[._-]/g, " ");
  $("#user-email").textContent = email;
  $("#user-name").textContent = titleCase(displayName);
  $("#user-avatar").textContent = initials(displayName);
}

function navigate(route) {
  if (location.hash === `#${route}`) {
    renderRoute(route);
  } else {
    location.hash = route;
  }
}

function routeFromHash() {
  if (!state.session) return;
  const route = (location.hash.replace(/^#/, "").split("?")[0] || "dashboard");
  renderRoute(pageMeta[route] ? route : "dashboard");
}

async function renderRoute(route) {
  state.route = route;
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.route === route));
  const [title, kicker] = pageMeta[route];
  $("#page-title").textContent = title;
  $("#page-kicker").textContent = kicker;
  $("#page-content").innerHTML = loadingState();
  try {
    const renderers = {
      dashboard: renderDashboard,
      students: renderStudents,
      "course-groups": renderCourseGroups,
      batches: renderBatches,
      finance: renderFinance,
      "coach-checklist": renderCoachChecklist,
      certificates: renderCertificates,
      reports: renderReports,
      settings: renderSettings
    };
    await renderers[route]();
  } catch (error) {
    console.error(error);
    renderPageError(error);
  }
}

/* ---------- Dashboard ---------- */

async function renderDashboard() {
  const f = state.dashboardFilters;
  let query = state.supabase
    .from("students")
    .select(`
      id, course_group_id, batch_id,
      course_group:course_groups(code,name),
      batch:batches(name,month,year,batch_number),
      finance:finance_records(payment_status),
      admin:admin_records(student_status),
      requirements(overall_status),
      certificates(status)
    `);
  if (f.courseGroup) query = query.eq("course_group_id", f.courseGroup);
  if (f.batch) query = query.eq("batch_id", f.batch);
  if ((f.month || f.year) && !f.batch) query = query.in("batch_id", batchIdsForPeriod(f.month, f.year, f.courseGroup));
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  const students = data || [];
  const counts = {
    total: students.length,
    pending: students.filter(s => s.finance?.payment_status === "Pending Payment").length,
    downpayment: students.filter(s => s.finance?.payment_status === "Downpayment Paid").length,
    paid: students.filter(s => s.finance?.payment_status === "Fully Paid").length,
    refunded: students.filter(s => s.finance?.payment_status === "Refunded").length,
    active: students.filter(s => s.admin?.student_status === "Active").length,
    inactive: students.filter(s => s.admin?.student_status === "Inactive").length,
    dropped: students.filter(s => s.admin?.student_status === "Dropped").length,
    completed: students.filter(s => s.admin?.student_status === "Completed").length,
    review: students.filter(s => s.requirements?.overall_status === "For Review" || s.certificates?.some(c => c.status === "For Review")).length,
    issued: students.filter(s => s.certificates?.some(c => c.status === "Issued")).length
  };
  const byCourse = groupCounts(students, s => s.course_group?.code || "Unassigned");
  const byBatch = groupCounts(students, s => s.batch?.name || "Unassigned").slice(0, 8);
  $("#page-content").innerHTML = `
    <section class="dashboard-welcome">
      <div>
        <h2>${greeting()}, ${escapeHtml(($("#user-name").textContent || "Admin").split(" ")[0])}</h2>
        <p>Here’s what’s happening across your student community.</p>
      </div>
      <div class="period-filter" id="dashboard-filters">
        ${selectControl("courseGroup", "All course groups", state.courseGroups.map(c => [c.id, c.code]), f.courseGroup)}
        ${selectControl("month", "All months", APP.months.map((m, i) => [i + 1, m]), f.month)}
        ${yearSelect("year", f.year, "All years")}
        ${selectControl("batch", "All batches", filteredBatchOptions(f.courseGroup), f.batch)}
      </div>
    </section>
    <section class="metrics-grid">
      ${metricCard("Total Students", counts.total, "Across selected filters", "users", "teal", true)}
      ${metricCard("Pending Payment", counts.pending, `${counts.downpayment} downpayments recorded`, "clock", "orange")}
      ${metricCard("Fully Paid", counts.paid, `${percent(counts.paid, counts.total)}% of students`, "check-circle", "green")}
      ${metricCard("Certificate Review", counts.review, `${counts.issued} certificates issued`, "award", "purple")}
    </section>
    <section class="dashboard-grid">
      <article class="card">
        <div class="card-head"><div><h3>Students by course group</h3><p>Distribution across programs</p></div><button class="action-link" data-jump="course-groups">View groups</button></div>
        <div class="card-body">${barList(byCourse, counts.total)}</div>
      </article>
      <article class="card">
        <div class="card-head"><div><h3>Student status</h3><p>Current enrollment state</p></div></div>
        <div class="card-body">
          <div class="status-list">
            ${statusListRow("Active", counts.active, "green")}
            ${statusListRow("Inactive", counts.inactive, "yellow")}
            ${statusListRow("Dropped", counts.dropped, "red")}
            ${statusListRow("Completed", counts.completed, "blue")}
          </div>
        </div>
      </article>
    </section>
    <section class="dashboard-grid">
      <article class="card">
        <div class="card-head"><div><h3>Top batches</h3><p>Student count in each monthly cohort</p></div><button class="action-link" data-jump="batches">Manage batches</button></div>
        <div class="card-body">${barList(byBatch, counts.total, true)}</div>
      </article>
      <article class="card">
        <div class="card-head"><div><h3>Payment overview</h3><p>Finance status distribution</p></div><button class="action-link" data-jump="finance">Open finance</button></div>
        <div class="card-body">
          <div class="status-list">
            ${statusListRow("Pending payment", counts.pending, "yellow")}
            ${statusListRow("Downpayment paid", counts.downpayment, "blue")}
            ${statusListRow("Fully paid", counts.paid, "green")}
            ${statusListRow("Refunded", counts.refunded, "red")}
          </div>
        </div>
      </article>
    </section>
  `;
  renderIcons($("#page-content"));
  $("#dashboard-filters").addEventListener("change", event => {
    state.dashboardFilters[event.target.name] = event.target.value;
    if (event.target.name === "courseGroup") state.dashboardFilters.batch = "";
    renderDashboard();
  });
  $$("[data-jump]", $("#page-content")).forEach(el => el.addEventListener("click", () => navigate(el.dataset.jump)));
}

/* ---------- Students ---------- */

async function renderStudents() {
  const f = state.studentFilters;
  const page = state.studentsPage;
  const start = (page - 1) * APP.pageSize;
  const end = start + APP.pageSize - 1;
  let query = state.supabase
    .from("students")
    .select(`
      id, first_name, last_name, email, phone, coach, training_plan, course_group_id, batch_id, updated_at,
      course_group:course_groups(code,name),
      batch:batches(name,month,year,batch_number),
      finance:finance_records!inner(payment_status),
      admin:admin_records!inner(student_status,concern_status),
      certificates!inner(status,certificate_type)
    `, { count: "exact" });
  if (f.search) {
    const term = sanitizeSearch(f.search);
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  if (f.courseGroup) query = query.eq("course_group_id", f.courseGroup);
  if (f.batch) query = query.eq("batch_id", f.batch);
  if ((f.month || f.year) && !f.batch) query = query.in("batch_id", batchIdsForPeriod(f.month, f.year, f.courseGroup));
  if (f.plan) query = query.eq("training_plan", f.plan);
  if (f.finance) query = query.eq("finance.payment_status", f.finance);
  if (f.admin) query = query.eq("admin.student_status", f.admin);
  if (f.certificate) query = query.eq("certificates.status", f.certificate);
  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(start, end);
  if (error) throw error;
  const students = data || [];
  state.lastStudentQuery = students;
  const totalPages = Math.max(1, Math.ceil((count || 0) / APP.pageSize));
  if (page > totalPages) {
    state.studentsPage = totalPages;
    return renderStudents();
  }
  $("#page-content").innerHTML = `
    <section class="page-head">
      <div><h2>Student directory</h2><p>Search, filter, and manage every student record.</p></div>
      <div class="page-actions">
        <button class="btn btn--outline btn--compact" id="import-students"><span data-icon="upload"></span>Import CSV</button>
        <button class="btn btn--outline btn--compact" id="export-all"><span data-icon="download"></span>Export all</button>
        <button class="btn btn--outline btn--compact" id="export-menu"><span data-icon="download"></span>Export filtered</button>
        <button class="btn btn--primary btn--compact" id="add-student"><span data-icon="plus"></span>Add student</button>
      </div>
    </section>
    <section class="filters" id="student-filters">
      <div class="filter-search"><span data-icon="search"></span><input class="control" name="search" value="${escapeAttr(f.search || "")}" placeholder="Search name, email, phone…"></div>
      ${selectControl("courseGroup", "All course groups", state.courseGroups.map(c => [c.id, c.code]), f.courseGroup)}
      ${selectControl("batch", "All batches", filteredBatchOptions(f.courseGroup), f.batch)}
      ${selectControl("month", "All months", APP.months.map((m, i) => [i + 1, m]), f.month)}
      ${yearSelect("year", f.year, "All years")}
      ${selectControl("plan", "All plans", APP.planOptions.map(v => [v, v]), f.plan)}
      ${selectControl("finance", "All payment statuses", APP.financeStatuses.map(v => [v, v]), f.finance)}
      ${selectControl("admin", "All student statuses", APP.studentStatuses.map(v => [v, v]), f.admin)}
      ${selectControl("certificate", "All certificate statuses", APP.certificateStatuses.map(v => [v, v]), f.certificate)}
      ${hasActiveFilters(f) ? `<button class="btn btn--ghost btn--compact" id="clear-filters">Clear</button>` : ""}
    </section>
    <div id="bulk-actions" class="bulk-bar ${state.selectedStudents.size ? "" : "hidden"}">
      <strong><span id="selected-count">${state.selectedStudents.size}</span> selected</strong>
      <span class="bulk-spacer"></span>
      <button class="btn btn--outline btn--compact" id="clear-selection">Clear selection</button>
      <button class="btn btn--danger-soft btn--compact" id="delete-selected"><span data-icon="trash"></span>Delete</button>
    </div>
    <section class="card table-card">
      ${students.length ? studentTable(students) : emptyState("users", "No students found", hasActiveFilters(f) ? "Try changing or clearing your filters." : "Import a CSV or add your first student to get started.", !hasActiveFilters(f) ? `<button class="btn btn--primary btn--compact" id="empty-add">Add student</button>` : "")}
      ${students.length ? pagination(count || 0, page, totalPages, APP.pageSize) : ""}
    </section>
  `;
  renderIcons($("#page-content"));
  bindStudentPageEvents(count || 0, totalPages);
}

function studentTable(students) {
  const allVisibleSelected = students.every(s => state.selectedStudents.has(s.id));
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th class="checkbox-col"><input id="select-visible" type="checkbox" ${allVisibleSelected ? "checked" : ""} aria-label="Select all visible students"></th>
          <th>Student name</th><th>Email</th><th>Phone</th><th>Course group</th><th>Batch name</th><th>Plan</th><th>Coach</th><th>Finance status</th><th>Student status</th><th>Certificate status</th><th>Last updated</th><th>Action</th>
        </tr></thead>
        <tbody>
          ${students.map(student => `
            <tr>
              <td class="checkbox-col"><input class="student-checkbox" type="checkbox" value="${student.id}" ${state.selectedStudents.has(student.id) ? "checked" : ""} aria-label="Select ${escapeAttr(fullName(student))}"></td>
              <td><button class="action-link student-cell" data-open-student="${student.id}">
                <span class="student-avatar">${initials(fullName(student))}</span>
                <span><strong>${escapeHtml(fullName(student))}</strong><small>${escapeHtml(student.email || "No email")}</small></span>
              </button></td>
              <td>${escapeHtml(student.email || "—")}</td>
              <td>${escapeHtml(student.phone || "—")}</td>
              <td><span class="badge badge--teal">${escapeHtml(student.course_group?.code || "—")}</span></td>
              <td>${escapeHtml(student.batch?.name || "—")}</td>
              <td>${statusBadge(studentPlan(student))}</td>
              <td>${escapeHtml(student.coach || "Unassigned")}</td>
              <td>${statusBadge(student.finance?.payment_status)}</td>
              <td>${statusBadge(student.admin?.student_status)}</td>
              <td>${statusBadge(certificateSummary(student.certificates))}</td>
              <td>${formatRelativeDate(student.updated_at)}</td>
              <td><div class="row-actions">
                <button class="icon-btn btn-icon-only" data-open-student="${student.id}" aria-label="Open student" title="Open profile"><span data-icon="eye"></span></button>
                <button class="icon-btn btn-icon-only" data-edit-student="${student.id}" aria-label="Edit student" title="Edit student"><span data-icon="edit-2"></span></button>
                <button class="icon-btn btn-icon-only text-danger" data-delete-student="${student.id}" aria-label="Delete student" title="Delete student"><span data-icon="trash-2"></span></button>
              </div></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function bindStudentPageEvents(total, totalPages) {
  $("#add-student")?.addEventListener("click", () => openStudentForm());
  $("#empty-add")?.addEventListener("click", () => openStudentForm());
  $("#import-students")?.addEventListener("click", openCsvImport);
  $("#export-all")?.addEventListener("click", () => exportStudents({}, "sync2va-all-students.csv"));
  $("#export-menu")?.addEventListener("click", () => exportStudents(state.studentFilters, "sync2va-students-filtered.csv"));
  $("#clear-filters")?.addEventListener("click", () => {
    state.studentFilters = {};
    state.studentsPage = 1;
    renderStudents();
  });
  const filters = $("#student-filters");
  if (filters) {
    let searchTimer;
    filters.addEventListener("input", event => {
      if (event.target.name !== "search") return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => updateStudentFilter(event.target.name, event.target.value), 350);
    });
    filters.addEventListener("change", event => {
      if (event.target.name === "search") return;
      updateStudentFilter(event.target.name, event.target.value);
    });
  }
  $("#select-visible")?.addEventListener("change", event => {
    state.lastStudentQuery.forEach(s => event.target.checked ? state.selectedStudents.add(s.id) : state.selectedStudents.delete(s.id));
    updateSelectionUi();
  });
  $$(".student-checkbox").forEach(box => box.addEventListener("change", event => {
    event.target.checked ? state.selectedStudents.add(event.target.value) : state.selectedStudents.delete(event.target.value);
    updateSelectionUi();
  }));
  $("#clear-selection")?.addEventListener("click", () => {
    state.selectedStudents.clear();
    updateSelectionUi();
  });
  $("#delete-selected")?.addEventListener("click", () => confirmBulkDelete([...state.selectedStudents]));
  $$("[data-open-student]").forEach(button => button.addEventListener("click", () => openStudentProfile(button.dataset.openStudent)));
  $$("[data-edit-student]").forEach(button => button.addEventListener("click", async () => {
    const student = await fetchStudent(button.dataset.editStudent);
    openStudentForm(student);
  }));
  $$("[data-delete-student]").forEach(button => button.addEventListener("click", () => confirmBulkDelete([button.dataset.deleteStudent])));
  $$("[data-page]").forEach(button => button.addEventListener("click", () => {
    state.studentsPage = Number(button.dataset.page);
    renderStudents();
  }));
}

function updateStudentFilter(name, value) {
  state.studentFilters[name] = value;
  if (name === "courseGroup") state.studentFilters.batch = "";
  state.studentsPage = 1;
  state.selectedStudents.clear();
  renderStudents();
}

function updateSelectionUi() {
  $("#bulk-actions")?.classList.toggle("hidden", !state.selectedStudents.size);
  if ($("#selected-count")) $("#selected-count").textContent = state.selectedStudents.size;
  $$(".student-checkbox").forEach(box => { box.checked = state.selectedStudents.has(box.value); });
  const visibleIds = state.lastStudentQuery.map(s => s.id);
  if ($("#select-visible")) $("#select-visible").checked = visibleIds.length > 0 && visibleIds.every(id => state.selectedStudents.has(id));
}

/* ---------- Course groups ---------- */

async function renderCourseGroups() {
  const { data, error } = await state.supabase
    .from("course_groups")
    .select("*, batches(count), students(count)")
    .order("status")
    .order("code");
  if (error) throw error;
  state.courseGroups = data || [];
  $("#page-content").innerHTML = `
    <section class="page-head">
      <div><h2>Course groups</h2><p>Maintain the programs that organize every batch and student.</p></div>
      <div class="page-actions"><button class="btn btn--primary btn--compact" id="add-course-group"><span data-icon="plus"></span>Create course group</button></div>
    </section>
    ${state.courseGroups.length ? `
      <section class="entity-grid">
        ${state.courseGroups.map(group => `
          <article class="card entity-card">
            <div class="entity-card-head">
              <span class="course-code">${escapeHtml(group.code)}</span>
              <div class="row-actions">
                <button class="icon-btn btn-icon-only kebab" data-edit-course="${group.id}" title="Edit course group"><span data-icon="edit-2"></span></button>
                <button class="icon-btn btn-icon-only kebab" data-archive-course="${group.id}" title="${group.status === "Active" ? "Archive" : "Activate"}"><span data-icon="${group.status === "Active" ? "archive" : "refresh-cw"}"></span></button>
              </div>
            </div>
            <h3>${escapeHtml(group.name)}</h3>
            <p>${escapeHtml(group.program_type)}</p>
            <div class="entity-meta"><span>${statusBadge(group.status)}</span><small>${group.students?.[0]?.count || 0} students · ${group.batches?.[0]?.count || 0} batches</small></div>
          </article>`).join("")}
      </section>` : emptyState("book", "No course groups", "Create a course group to begin organizing programs.", `<button class="btn btn--primary btn--compact" id="empty-course">Create group</button>`)}
  `;
  renderIcons($("#page-content"));
  $("#add-course-group")?.addEventListener("click", () => openCourseGroupForm());
  $("#empty-course")?.addEventListener("click", () => openCourseGroupForm());
  $$("[data-edit-course]").forEach(btn => btn.addEventListener("click", () => openCourseGroupForm(state.courseGroups.find(g => g.id === btn.dataset.editCourse))));
  $$("[data-archive-course]").forEach(btn => btn.addEventListener("click", () => toggleCourseGroup(btn.dataset.archiveCourse)));
}

function openCourseGroupForm(group = null) {
  openModal({
    title: group ? "Edit course group" : "Create course group",
    subtitle: "Course codes are used to generate batch names and validate CSV imports.",
    size: "small",
    body: `
      <form id="course-form">
        <label class="field"><span>Course Code</span><input name="code" value="${escapeAttr(group?.code || "")}" placeholder="e.g. USBK" required maxlength="30"></label>
        <label class="field"><span>Course Name</span><input name="name" value="${escapeAttr(group?.name || "")}" placeholder="e.g. US Bookkeeping" required maxlength="120"></label>
        <label class="field"><span>Program Type</span><select name="program_type" required>
          ${optionsHtml(["Intensive Training", "Career Accelerator"], group?.program_type)}
        </select></label>
        <label class="field"><span>Status</span><select name="status">${optionsHtml(["Active", "Archived"], group?.status || "Active")}</select></label>
      </form>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--primary" id="save-course">${group ? "Save changes" : "Create group"}</button>`
  });
  $("#save-course").addEventListener("click", async () => {
    const form = $("#course-form");
    if (!form.reportValidity()) return;
    const values = formValues(form);
    values.code = values.code.trim().toUpperCase().replace(/\s+/g, " ");
    setButtonLoading($("#save-course"), true, "Saving…");
    const operation = group
      ? state.supabase.from("course_groups").update(values).eq("id", group.id)
      : state.supabase.from("course_groups").insert(values);
    const { error } = await operation;
    if (error) {
      setButtonLoading($("#save-course"), false);
      toast("Could not save course group", friendlyError(error), "error");
      return;
    }
    closeModal();
    toast("Course group saved", `${values.code} is ready to use.`, "success");
    await loadLookups();
    renderCourseGroups();
  });
}

async function toggleCourseGroup(id) {
  const group = state.courseGroups.find(g => g.id === id);
  if (!group) return;
  const next = group.status === "Active" ? "Archived" : "Active";
  const { error } = await state.supabase.from("course_groups").update({ status: next }).eq("id", id);
  if (error) return toast("Could not update group", friendlyError(error), "error");
  toast(`Course group ${next.toLowerCase()}`, `${group.code} is now ${next.toLowerCase()}.`, "success");
  await loadLookups();
  renderCourseGroups();
}

/* ---------- Batches ---------- */

async function renderBatches() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const f = {
    courseGroup: params.get("courseGroup") || "",
    month: params.get("month") || "",
    year: params.get("year") || "",
    status: params.get("status") || ""
  };
  let query = state.supabase.from("batches").select("*, course_group:course_groups(id,code,name), students(count)");
  if (f.courseGroup) query = query.eq("course_group_id", f.courseGroup);
  if (f.month) query = query.eq("month", Number(f.month));
  if (f.year) query = query.eq("year", Number(f.year));
  if (f.status) query = query.eq("status", f.status);
  const { data, error } = await query.order("year", { ascending: false }).order("month", { ascending: false }).order("batch_number");
  if (error) throw error;
  const batches = data || [];
  $("#page-content").innerHTML = `
    <section class="page-head">
      <div><h2>Batch management</h2><p>Create monthly cohorts, archive old batches, and manage enrollment.</p></div>
      <div class="page-actions">
        <button class="btn btn--outline btn--compact" id="create-monthly"><span data-icon="calendar"></span>Create Monthly Batches</button>
        <button class="btn btn--primary btn--compact" id="add-batch"><span data-icon="plus"></span>Create batch</button>
      </div>
    </section>
    <section class="filters" id="batch-filters">
      ${selectControl("courseGroup", "All course groups", state.courseGroups.map(c => [c.id, c.code]), f.courseGroup)}
      ${selectControl("month", "All months", APP.months.map((m, i) => [i + 1, m]), f.month)}
      ${yearSelect("year", f.year, "All years")}
      ${selectControl("status", "All statuses", ["Active", "Completed", "Archived"].map(v => [v, v]), f.status)}
      <span class="filter-spacer"></span><span class="filter-count">${batches.length} batch${batches.length === 1 ? "" : "es"}</span>
    </section>
    <section class="card table-card">
      ${batches.length ? `
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Batch name</th><th>Course group</th><th>Month</th><th>Dates</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${batches.map(batch => `
            <tr>
              <td><strong>${escapeHtml(batch.name)}</strong></td>
              <td><span class="badge badge--teal">${escapeHtml(batch.course_group?.code || "—")}</span></td>
              <td>${APP.months[batch.month - 1]} ${batch.year}</td>
              <td>${formatDate(batch.start_date)} – ${formatDate(batch.end_date)}</td>
              <td>${batch.students?.[0]?.count || 0}</td>
              <td>${statusBadge(batch.status)}</td>
              <td><div class="row-actions">
                <button class="icon-btn btn-icon-only" data-edit-batch="${batch.id}" title="Edit batch"><span data-icon="edit-2"></span></button>
                <button class="icon-btn btn-icon-only" data-archive-batch="${batch.id}" title="Archive batch"><span data-icon="archive"></span></button>
                <button class="icon-btn btn-icon-only text-danger" data-clear-batch="${batch.id}" data-batch-name="${escapeAttr(batch.name)}" title="Delete all students"><span data-icon="user-x"></span></button>
              </div></td>
            </tr>`).join("")}</tbody>
        </table></div>` : emptyState("layers", "No batches found", "Create a batch or change the current filters.")}
    </section>
  `;
  renderIcons($("#page-content"));
  $("#add-batch").addEventListener("click", () => openBatchForm());
  $("#create-monthly").addEventListener("click", openMonthlyBatchForm);
  $("#batch-filters").addEventListener("change", event => {
    const current = new URLSearchParams(location.hash.split("?")[1] || "");
    event.target.value ? current.set(event.target.name, event.target.value) : current.delete(event.target.name);
    history.replaceState(null, "", `#batches${current.toString() ? `?${current}` : ""}`);
    renderBatches();
  });
  $$("[data-edit-batch]").forEach(btn => btn.addEventListener("click", () => openBatchForm(batches.find(b => b.id === btn.dataset.editBatch))));
  $$("[data-archive-batch]").forEach(btn => btn.addEventListener("click", () => archiveBatch(btn.dataset.archiveBatch)));
  $$("[data-clear-batch]").forEach(btn => btn.addEventListener("click", () => confirmClearBatch(btn.dataset.clearBatch, btn.dataset.batchName)));
}

function openBatchForm(batch = null) {
  openModal({
    title: batch ? "Edit batch" : "Create batch",
    subtitle: "The batch name is generated from the course group, month, year, and number.",
    size: "medium",
    body: `
      <form id="batch-form" class="form-grid">
        <label class="field"><span>Course Group</span><select name="course_group_id" required ${batch ? "disabled" : ""}>
          <option value="">Select course group</option>${optionsHtml(state.courseGroups.filter(c => c.status === "Active").map(c => [c.id, `${c.code} — ${c.name}`]), batch?.course_group_id)}
        </select></label>
        <label class="field"><span>Month</span><select name="month" required>${optionsHtml(APP.months.map((m, i) => [i + 1, m]), batch?.month || new Date().getMonth() + 1)}</select></label>
        <label class="field"><span>Year</span><input name="year" type="number" min="2020" max="2100" value="${batch?.year || new Date().getFullYear()}" required></label>
        <label class="field"><span>Batch Number</span><select name="batch_number" required>${optionsHtml([[1, "Batch 1"], [2, "Batch 2"]], batch?.batch_number || 1)}</select></label>
        <label class="field span-2"><span>Batch Name</span><input id="batch-name-preview" name="name" value="${escapeAttr(batch?.name || "")}" readonly></label>
        <label class="field"><span>Start Date</span><input name="start_date" type="date" value="${batch?.start_date || ""}"></label>
        <label class="field"><span>End Date</span><input name="end_date" type="date" value="${batch?.end_date || ""}"></label>
        <label class="field span-2"><span>Status</span><select name="status">${optionsHtml(["Active", "Completed", "Archived"], batch?.status || "Active")}</select></label>
      </form>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--primary" id="save-batch">${batch ? "Save changes" : "Create batch"}</button>`
  });
  const form = $("#batch-form");
  const refreshName = () => {
    const groupId = form.elements.course_group_id.value || batch?.course_group_id;
    const code = state.courseGroups.find(c => c.id === groupId)?.code || "";
    const month = APP.months[Number(form.elements.month.value) - 1] || "";
    $("#batch-name-preview").value = code && month ? `${code} - ${month} ${form.elements.year.value} - Batch ${form.elements.batch_number.value}` : "";
  };
  form.addEventListener("change", refreshName);
  form.addEventListener("input", refreshName);
  refreshName();
  $("#save-batch").addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    const values = formValues(form);
    values.course_group_id = values.course_group_id || batch?.course_group_id;
    values.month = Number(values.month);
    values.year = Number(values.year);
    values.batch_number = Number(values.batch_number);
    setButtonLoading($("#save-batch"), true, "Saving…");
    const operation = batch
      ? state.supabase.from("batches").update(values).eq("id", batch.id)
      : state.supabase.from("batches").insert(values);
    const { error } = await operation;
    if (error) {
      setButtonLoading($("#save-batch"), false);
      return toast("Could not save batch", friendlyError(error), "error");
    }
    closeModal();
    toast("Batch saved", values.name, "success");
    await loadLookups();
    renderBatches();
  });
}

function openMonthlyBatchForm() {
  openModal({
    title: "Create Monthly Batches",
    subtitle: "Creates Batch 1 and Batch 2 for every active course group while skipping duplicates.",
    size: "small",
    body: `
      <form id="monthly-batch-form">
        <label class="field"><span>Month</span><select name="month">${optionsHtml(APP.months.map((m, i) => [i + 1, m]), new Date().getMonth() + 1)}</select></label>
        <label class="field"><span>Year</span><input name="year" type="number" min="2020" max="2100" value="${new Date().getFullYear()}" required></label>
        <div class="inline-alert">This can create up to ${state.courseGroups.filter(c => c.status === "Active").length * 2} batches. Existing combinations will be skipped.</div>
      </form>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--primary" id="confirm-monthly">Create batches</button>`
  });
  $("#confirm-monthly").addEventListener("click", async () => {
    const form = $("#monthly-batch-form");
    if (!form.reportValidity()) return;
    const month = Number(form.elements.month.value);
    const year = Number(form.elements.year.value);
    const activeGroups = state.courseGroups.filter(c => c.status === "Active");
    const rows = activeGroups.flatMap(group => [1, 2].map(batchNumber => ({
      course_group_id: group.id,
      month,
      year,
      batch_number: batchNumber,
      name: `${group.code} - ${APP.months[month - 1]} ${year} - Batch ${batchNumber}`,
      status: "Active"
    })));
    setButtonLoading($("#confirm-monthly"), true, "Creating…");
    const { data, error } = await state.supabase
      .from("batches")
      .upsert(rows, { onConflict: "course_group_id,month,year,batch_number", ignoreDuplicates: true })
      .select("id");
    if (error) {
      setButtonLoading($("#confirm-monthly"), false);
      return toast("Could not create batches", friendlyError(error), "error");
    }
    closeModal();
    toast("Monthly batches ready", `${data?.length || 0} new batches created; duplicates were skipped.`, "success");
    await loadLookups();
    renderBatches();
  });
}

async function archiveBatch(id) {
  const { error } = await state.supabase.from("batches").update({ status: "Archived" }).eq("id", id);
  if (error) return toast("Could not archive batch", friendlyError(error), "error");
  toast("Batch archived", "Student records remain safely attached.", "success");
  await loadLookups();
  renderBatches();
}

function confirmClearBatch(batchId, batchName) {
  openConfirm({
    title: "Delete every student in this batch?",
    message: `${batchName} and its batch record will remain, but every student and all related finance, admin, coaching, requirement, certificate, and note records in it will be permanently deleted.`,
    confirmLabel: "Delete all students",
    onConfirm: async button => {
      setButtonLoading(button, true, "Deleting…");
      const { error } = await state.supabase.from("students").delete().eq("batch_id", batchId);
      if (error) {
        setButtonLoading(button, false);
        return toast("Could not clear batch", friendlyError(error), "error");
      }
      closeModal();
      toast("Batch students deleted", `${batchName} is now empty.`, "success");
      renderBatches();
    }
  });
}

/* ---------- Finance ---------- */

async function renderFinance() {
  const { data, error } = await state.supabase
    .from("finance_records")
    .select(`
      id, payment_status, amount_paid, balance, payment_method, payment_date, updated_at,
      student:students!inner(id,first_name,last_name,email,course_group:course_groups(code),batch:batches(name))
    `)
    .order("updated_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  const records = data || [];
  const totals = {
    pending: records.filter(r => r.payment_status === "Pending Payment").length,
    downpayment: records.filter(r => r.payment_status === "Downpayment Paid").length,
    paid: records.filter(r => r.payment_status === "Fully Paid").length,
    refunded: records.filter(r => r.payment_status === "Refunded").length,
    received: records.reduce((sum, r) => sum + Number(r.amount_paid || 0), 0)
  };
  $("#page-content").innerHTML = `
    <section class="page-head">
      <div><h2>Finance overview</h2><p>Monitor payment status, amounts received, and outstanding balances.</p></div>
      <div class="page-actions"><button class="btn btn--outline btn--compact" id="export-finance"><span data-icon="download"></span>Export finance</button></div>
    </section>
    <section class="metrics-grid">
      ${metricCard("Pending Payment", totals.pending, "Awaiting first payment", "clock", "orange")}
      ${metricCard("Downpayment Paid", totals.downpayment, "Partially paid students", "wallet", "purple")}
      ${metricCard("Fully Paid", totals.paid, "Cleared payment records", "check-circle", "green")}
      ${metricCard("Amount Received", formatCurrency(totals.received), `${totals.refunded} refunded records`, "trending-up", "teal", true)}
    </section>
    <section class="filters" id="finance-filters">
      <div class="filter-search"><span data-icon="search"></span><input class="control" name="search" placeholder="Search student…"></div>
      ${selectControl("status", "All payment statuses", APP.financeStatuses.map(v => [v, v]))}
      <span class="filter-spacer"></span><span class="filter-count">${records.length} finance records</span>
    </section>
    <section class="card table-card">
      <div class="table-wrap ${records.length ? "" : "hidden"}"><table class="data-table">
        <thead><tr><th>Student</th><th>Course group</th><th>Batch</th><th>Payment status</th><th>Amount paid</th><th>Balance</th><th>Method</th><th>Payment date</th><th>Action</th></tr></thead>
        <tbody id="finance-table-body">${financeRows(records)}</tbody>
      </table></div>
      <div id="finance-empty" class="${records.length ? "hidden" : ""}">${emptyState("wallet", "No finance records found", "Try a different search or payment status.")}</div>
    </section>
  `;
  renderIcons($("#page-content"));
  const filterRecords = () => {
    const term = $("#finance-filters [name=search]").value.trim().toLowerCase();
    const status = $("#finance-filters [name=status]").value;
    const filtered = records.filter(r => (!status || r.payment_status === status) && (!term || `${fullName(r.student)} ${r.student?.email || ""}`.toLowerCase().includes(term)));
    $("#finance-table-body").innerHTML = financeRows(filtered);
    $("#finance-table-body").closest(".table-wrap").classList.toggle("hidden", !filtered.length);
    $("#finance-empty").classList.toggle("hidden", Boolean(filtered.length));
    renderIcons($("#finance-table-body"));
    bindFinanceRows();
  };
  $("#finance-filters").addEventListener("input", filterRecords);
  $("#finance-filters").addEventListener("change", filterRecords);
  bindFinanceRows();
  $("#export-finance").addEventListener("click", () => exportFinance(records));
}

function financeRows(records) {
  return records.map(record => `
    <tr>
      <td><button class="action-link student-cell" data-finance-student="${record.student?.id}">
        <span class="student-avatar">${initials(fullName(record.student))}</span>
        <span><strong>${escapeHtml(fullName(record.student))}</strong><small>${escapeHtml(record.student?.email || "")}</small></span>
      </button></td>
      <td>${escapeHtml(record.student?.course_group?.code || "—")}</td>
      <td>${escapeHtml(record.student?.batch?.name || "—")}</td>
      <td>${statusBadge(record.payment_status)}</td>
      <td>${formatCurrency(record.amount_paid)}</td>
      <td>${formatCurrency(record.balance)}</td>
      <td>${escapeHtml(record.payment_method || "—")}</td>
      <td>${formatDate(record.payment_date)}</td>
      <td><button class="icon-btn btn-icon-only" data-finance-student="${record.student?.id}" title="Open finance profile"><span data-icon="edit-2"></span></button></td>
    </tr>`).join("");
}

function bindFinanceRows() {
  $$("[data-finance-student]").forEach(btn => btn.addEventListener("click", () => openStudentProfile(btn.dataset.financeStudent, "finance")));
}

/* ---------- Coach checklist ---------- */

async function renderCoachChecklist() {
  const { data, error } = await state.supabase
    .from("students")
    .select(`
      id,first_name,last_name,email,coach,training_plan,course_group_id,
      course_group:course_groups(id,code),
      batch:batches(name),
      classroom:classroom_records(invite_status,date_sent,sent_by),
      student_activities(status,score,activity:activities(*)),
      requirements(overall_status)
    `)
    .order("updated_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  const students = data || [];
  $("#page-content").innerHTML = `
    <section class="page-head">
      <div><h2>Coach checklist</h2><p>Track Classroom invitations, activity progress, and student readiness.</p></div>
    </section>
    <section class="filters" id="coach-filters">
      <div class="filter-search"><span data-icon="search"></span><input class="control" name="search" placeholder="Search student or coach…"></div>
      ${selectControl("course", "All course groups", APP.courseCodes.map(v => [v, v]))}
      ${selectControl("plan", "All plans", APP.planOptions.map(v => [v, v]))}
      ${selectControl("invite", "All invite statuses", ["Yes", "No", "Pending"].map(v => [v, v]))}
      ${selectControl("requirement", "All readiness", ["Certificate Ready", "Not Ready", "For Review"].map(v => [v, v]))}
      <span class="filter-spacer"></span><span class="filter-count">${students.length} students</span>
    </section>
    <section class="card table-card">
      <div class="table-wrap ${students.length ? "" : "hidden"}"><table class="data-table">
        <thead><tr><th>Student</th><th>Course group</th><th>Plan</th><th>Coach</th><th>Classroom invite</th><th>Activities passed</th><th>Average score</th><th>Requirement status</th><th>Action</th></tr></thead>
        <tbody id="coach-table-body">${coachRows(students)}</tbody>
      </table></div>
      <div id="coach-empty" class="${students.length ? "hidden" : ""}">${emptyState("check-square", "No students found", "Try changing the checklist filters.")}</div>
    </section>
  `;
  renderIcons($("#page-content"));
  const apply = () => {
    const term = $("#coach-filters [name=search]").value.toLowerCase().trim();
    const course = $("#coach-filters [name=course]").value;
    const plan = $("#coach-filters [name=plan]").value;
    const invite = $("#coach-filters [name=invite]").value;
    const requirement = $("#coach-filters [name=requirement]").value;
    const filtered = students.filter(s =>
      (!term || `${fullName(s)} ${s.email || ""} ${s.coach || ""}`.toLowerCase().includes(term)) &&
      (!course || s.course_group?.code === course) &&
      (!plan || studentPlan(s) === plan) &&
      (!invite || s.classroom?.invite_status === invite) &&
      (!requirement || s.requirements?.overall_status === requirement)
    );
    $("#coach-table-body").innerHTML = coachRows(filtered);
    $("#coach-table-body").closest(".table-wrap").classList.toggle("hidden", !filtered.length);
    $("#coach-empty").classList.toggle("hidden", Boolean(filtered.length));
    renderIcons($("#coach-table-body"));
    bindCoachRows();
  };
  $("#coach-filters").addEventListener("input", apply);
  $("#coach-filters").addEventListener("change", apply);
  bindCoachRows();
}

function coachRows(students) {
  return students.map(student => {
    const activities = relevantStudentActivities(student);
    const passed = activities.filter(a => a.status === "Pass").length;
    const scored = activities.filter(a => a.score !== null && a.score !== "");
    const expectedActivities = activeActivityCountForStudent(student);
    const average = scored.length ? Math.round(scored.reduce((sum, a) => sum + Number(a.score), 0) / scored.length) : null;
    return `
      <tr>
        <td><button class="action-link student-cell" data-coach-student="${student.id}">
          <span class="student-avatar">${initials(fullName(student))}</span><span><strong>${escapeHtml(fullName(student))}</strong><small>${escapeHtml(student.batch?.name || "")}</small></span>
        </button></td>
        <td><span class="badge badge--teal">${escapeHtml(student.course_group?.code || "—")}</span></td>
        <td>${statusBadge(studentPlan(student))}</td>
        <td>${escapeHtml(student.coach || "Unassigned")}</td>
        <td>${statusBadge(student.classroom?.invite_status || "Pending")}</td>
        <td>${passed} / ${Math.max(activities.length, expectedActivities)}</td>
        <td>${average === null ? "—" : `${average}%`}</td>
        <td>${statusBadge(student.requirements?.overall_status || "For Review")}</td>
        <td><button class="icon-btn btn-icon-only" data-coach-student="${student.id}" title="Open coach checklist"><span data-icon="edit-2"></span></button></td>
      </tr>`;
  }).join("");
}

function bindCoachRows() {
  $$("[data-coach-student]").forEach(btn => btn.addEventListener("click", () => openStudentProfile(btn.dataset.coachStudent, "coaches")));
}

function relevantStudentActivities(student) {
  return (student.student_activities || [])
    .filter(row => isRelevantActivityForStudent(student, row.activity || {}))
    .sort((a, b) => {
      const trackCompare = activityTrackSort(a.activity) - activityTrackSort(b.activity);
      return trackCompare || (a.activity?.sort_order || 0) - (b.activity?.sort_order || 0);
    });
}

function activeActivityCountForStudent(student) {
  return state.activities.filter(activity => isRelevantActivityForStudent(student, activity)).length;
}

function isRelevantActivityForStudent(student, activity) {
  if (activity.is_active === false) return false;
  const track = activityTrack(activity);
  if (track === "CAP") return studentPlan(student) === "1 Month";
  if (track !== "Intensive") return false;
  const intensiveCourseId = intensiveCourseGroupIdForStudent(student);
  if (activity.course_group_id && intensiveCourseId && activity.course_group_id !== intensiveCourseId) return false;
  if (activity.course_group_id && !intensiveCourseId) return false;
  return true;
}

function activityTrack(activity = {}) {
  if (activity.activity_track) return activity.activity_track;
  return activity.course_group_id ? "Intensive" : "CAP";
}

function activityTrackSort(activity = {}) {
  return activityTrack(activity) === "CAP" ? 2 : 1;
}

function studentPlan(student = {}) {
  return APP.planOptions.includes(student.training_plan) ? student.training_plan : "2 Weeks";
}

function intensiveCourseGroupIdForStudent(student = {}) {
  const code = (student.course_group?.code || "").replace(/^CAP\s+/i, "");
  const intensiveGroup = state.courseGroups.find(group => group.code === code);
  return intensiveGroup?.id || student.course_group_id || student.course_group?.id || "";
}

/* ---------- Certificates ---------- */

async function renderCertificates() {
  const records = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await state.supabase
      .from("certificates")
      .select(`
        id,certificate_type,status,issued_date,certificate_number,issued_by,updated_at,
        student:students!inner(id,first_name,last_name,email,course_group:course_groups(code),batch:batches(name),requirements(overall_status))
      `)
      .order("updated_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    records.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  const summary = {
    eligible: records.filter(r => r.student?.requirements?.overall_status === "Certificate Ready").length,
    review: records.filter(r => r.status === "For Review").length,
    approved: records.filter(r => r.status === "Approved").length,
    issued: records.filter(r => r.status === "Issued").length
  };
  $("#page-content").innerHTML = `
    <section class="page-head">
      <div><h2>Certificate workflow</h2><p>Review eligibility, approve records, and record certificate issuance.</p></div>
      <div class="page-actions"><button class="btn btn--outline btn--compact" id="export-certificates"><span data-icon="download"></span>Export records</button></div>
    </section>
    <section class="metrics-grid">
      ${metricCard("Certificate Ready", summary.eligible, "Requirement-cleared records", "check-circle", "teal", true)}
      ${metricCard("For Review", summary.review, "Awaiting admin review", "clock", "orange")}
      ${metricCard("Approved", summary.approved, "Ready for issuance", "thumbs-up", "purple")}
      ${metricCard("Issued", summary.issued, "Completed certificates", "award", "green")}
    </section>
    <section class="filters" id="certificate-filters">
      <div class="filter-search"><span data-icon="search"></span><input class="control" name="search" placeholder="Search student or certificate no.…"></div>
      ${selectControl("type", "All certificate types", ["Intensive Training Certificate", "Career Accelerator Program Certificate"].map(v => [v, v]))}
      ${selectControl("status", "All statuses", APP.certificateStatuses.map(v => [v, v]))}
      <span class="filter-spacer"></span><span class="filter-count">${records.length} certificate records</span>
    </section>
    <section class="card table-card">
      <div class="table-wrap ${records.length ? "" : "hidden"}"><table class="data-table">
        <thead><tr><th>Student</th><th>Course</th><th>Certificate type</th><th>Eligibility</th><th>Status</th><th>Certificate no.</th><th>Issued date</th><th>Issued by</th><th>Action</th></tr></thead>
        <tbody id="certificate-table-body">${certificateRows(records)}</tbody>
      </table></div>
      <div id="certificate-empty" class="${records.length ? "hidden" : ""}">${emptyState("award", "No certificate records", "Try changing the certificate filters.")}</div>
    </section>
  `;
  renderIcons($("#page-content"));
  const apply = () => {
    const term = $("#certificate-filters [name=search]").value.trim().toLowerCase();
    const type = $("#certificate-filters [name=type]").value;
    const status = $("#certificate-filters [name=status]").value;
    const filtered = records.filter(r =>
      (!term || `${fullName(r.student)} ${r.certificate_number || ""}`.toLowerCase().includes(term)) &&
      (!type || r.certificate_type === type) &&
      (!status || r.status === status)
    );
    $("#certificate-table-body").innerHTML = certificateRows(filtered);
    $("#certificate-table-body").closest(".table-wrap").classList.toggle("hidden", !filtered.length);
    $("#certificate-empty").classList.toggle("hidden", Boolean(filtered.length));
    renderIcons($("#certificate-table-body"));
    bindCertificateRows();
  };
  $("#certificate-filters").addEventListener("input", apply);
  $("#certificate-filters").addEventListener("change", apply);
  bindCertificateRows();
  $("#export-certificates").addEventListener("click", () => exportCertificateRecords(records));
}

function certificateRows(records) {
  return records.map(record => `
    <tr>
      <td><button class="action-link student-cell" data-certificate-student="${record.student?.id}">
        <span class="student-avatar">${initials(fullName(record.student))}</span><span><strong>${escapeHtml(fullName(record.student))}</strong><small>${escapeHtml(record.student?.batch?.name || "")}</small></span>
      </button></td>
      <td>${escapeHtml(record.student?.course_group?.code || "—")}</td>
      <td>${escapeHtml(record.certificate_type.replace(" Certificate", ""))}</td>
      <td>${statusBadge(record.student?.requirements?.overall_status || "For Review")}</td>
      <td>${statusBadge(record.status)}</td>
      <td>${escapeHtml(record.certificate_number || "—")}</td>
      <td>${formatDate(record.issued_date)}</td>
      <td>${escapeHtml(record.issued_by || "—")}</td>
      <td><button class="icon-btn btn-icon-only" data-certificate-student="${record.student?.id}" title="Open certificates"><span data-icon="edit-2"></span></button></td>
    </tr>`).join("");
}

function bindCertificateRows() {
  $$("[data-certificate-student]").forEach(btn => btn.addEventListener("click", () => openStudentProfile(btn.dataset.certificateStudent, "certificates")));
}

/* ---------- Reports ---------- */

function renderReports() {
  const reports = [
    ["all", "All students", "Complete student directory", "users"],
    ["batch", "Students by batch", "Choose a monthly batch", "layers"],
    ["course", "Students by course group", "Choose a program", "book"],
    ["pending", "Pending payment", "Students awaiting payment", "clock"],
    ["paid", "Fully paid", "Payment-cleared students", "check-circle"],
    ["refunded", "Refunded", "Refunded payment records", "refresh-cw"],
    ["ready", "Certificate-ready", "All requirements cleared", "award"],
    ["issued", "Issued certificates", "Certificate issuance register", "file-text"]
  ];
  $("#page-content").innerHTML = `
    <section class="page-head">
      <div><h2>Reports & exports</h2><p>Download clean CSV files for operations, finance, and certificates.</p></div>
    </section>
    <section class="report-grid">
      ${reports.map(([key, title, description, icon]) => `
        <button class="card report-card" data-report="${key}">
          <span class="report-icon" data-icon="${icon}"></span>
          <span><h3>${title}</h3><p>${description}</p></span>
          <span data-icon="download"></span>
        </button>`).join("")}
    </section>
    <section class="card" style="margin-top:18px">
      <div class="card-head"><div><h3>About exported data</h3><p>CSV files open in Excel, Google Sheets, and most reporting tools.</p></div></div>
      <div class="card-body muted" style="font-size:12px">
        Exports include current Supabase records and reflect the filters selected when you generate them. Sensitive student data should be handled according to your organization’s privacy policy.
      </div>
    </section>
  `;
  renderIcons($("#page-content"));
  $$("[data-report]").forEach(card => card.addEventListener("click", () => runReport(card.dataset.report)));
}

async function runReport(type) {
  if (type === "batch") return openReportPicker("batch");
  if (type === "course") return openReportPicker("course");
  const filters = {};
  if (type === "pending") filters.finance = "Pending Payment";
  if (type === "paid") filters.finance = "Fully Paid";
  if (type === "refunded") filters.finance = "Refunded";
  if (type === "ready") filters.requirement = "Certificate Ready";
  if (type === "issued") filters.certificate = "Issued";
  await exportStudents(filters, `sync2va-${type}-report.csv`);
}

function openReportPicker(type) {
  const isBatch = type === "batch";
  openModal({
    title: `Export students by ${isBatch ? "batch" : "course group"}`,
    subtitle: "Select the group to include in this CSV report.",
    size: "small",
    body: `<label class="field"><span>${isBatch ? "Batch" : "Course Group"}</span><select id="report-picker" required>
      <option value="">Select ${isBatch ? "batch" : "course group"}</option>
      ${optionsHtml(isBatch ? state.batches.map(b => [b.id, b.name]) : state.courseGroups.map(c => [c.id, `${c.code} — ${c.name}`]))}
    </select></label>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--primary" id="run-picked-report">Export CSV</button>`
  });
  $("#run-picked-report").addEventListener("click", async () => {
    const value = $("#report-picker").value;
    if (!value) return toast("Choose a value", `Select a ${isBatch ? "batch" : "course group"} first.`, "warning");
    const button = $("#run-picked-report");
    setButtonLoading(button, true, "Exporting…");
    await exportStudents({ [isBatch ? "batch" : "courseGroup"]: value }, `sync2va-${type}-report.csv`);
    closeModal();
  });
}

/* ---------- Settings ---------- */

function renderSettings() {
  const config = getSupabaseConfig();
  const email = state.session?.user?.email || "";
  $("#page-content").innerHTML = `
    <section class="page-head"><div><h2>Workspace settings</h2><p>Manage the connection and account used by this browser.</p></div></section>
    <section class="section-grid section-grid--sidebar">
      <article class="card">
        <div class="card-body settings-content">
          <h3>Supabase connection</h3>
          <p>Only the public Project URL and anon key belong here. Student data remains in Supabase.</p>
          <div class="connection-status"><span data-icon="check-circle"></span><span>Connected as <strong>${escapeHtml(email)}</strong></span></div>
          <form id="settings-connection-form">
            <label class="field"><span>Supabase Project URL</span><input name="url" type="url" value="${escapeAttr(config.url)}" placeholder="https://your-project.supabase.co" required></label>
            <label class="field"><span>Supabase Anon Key</span><textarea name="key" rows="4" placeholder="Public anon key" required>${escapeHtml(config.key)}</textarea><small class="field-hint">Never paste a service role key into frontend code.</small></label>
            <div class="page-actions" style="justify-content:flex-start">
              <button class="btn btn--primary" type="submit">Save connection</button>
              <button class="btn btn--outline" type="button" id="test-connection">Test connection</button>
            </div>
          </form>
          <div class="divider"></div>
          <h3>Database setup</h3>
          <p>Run <code>supabase-schema.sql</code> in the Supabase SQL Editor before using a new project. It creates UUID tables, indexes, triggers, reference data, and authenticated-user RLS policies.</p>
        </div>
      </article>
      <aside class="card">
        <div class="card-head"><div><h3>Account</h3><p>Current authenticated user</p></div></div>
        <div class="card-body">
          <div class="student-cell" style="margin-bottom:18px"><span class="avatar">${initials(email)}</span><span><strong>${escapeHtml(email)}</strong><small>Authenticated user</small></span></div>
          <button class="btn btn--outline btn--wide" id="settings-sign-out"><span data-icon="log-out"></span>Sign out</button>
        </div>
      </aside>
    </section>
  `;
  renderIcons($("#page-content"));
  $("#settings-sign-out").addEventListener("click", signOut);
  $("#settings-connection-form").addEventListener("submit", saveConnectionSettings);
  $("#test-connection").addEventListener("click", testConnectionSettings);
}

async function saveConnectionSettings(event) {
  event.preventDefault();
  const values = formValues(event.currentTarget);
  localStorage.setItem("sync2va_supabase_url", values.url.trim());
  localStorage.setItem("sync2va_supabase_anon_key", values.key.trim());
  toast("Connection saved", "Reloading with the updated Supabase project.", "success");
  setTimeout(() => location.reload(), 700);
}

async function testConnectionSettings() {
  const form = $("#settings-connection-form");
  if (!form.reportValidity()) return;
  const values = formValues(form);
  const button = $("#test-connection");
  setButtonLoading(button, true, "Testing…");
  try {
    const client = window.supabase.createClient(values.url.trim(), values.key.trim());
    const { error } = await client.from("course_groups").select("id", { count: "exact", head: true });
    if (error) throw error;
    toast("Connection works", "The course_groups table is reachable.", "success");
  } catch (error) {
    toast("Connection failed", friendlyError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

/* ---------- Student create/edit/delete ---------- */

async function fetchStudent(id) {
  const { data, error } = await state.supabase
    .from("students")
    .select(`
      *,
      course_group:course_groups(id,code,name),
      batch:batches(id,name,month,year,batch_number),
      finance:finance_records(*),
      admin:admin_records(*),
      classroom:classroom_records(*),
      student_activities(*,activity:activities(*)),
      requirements(*),
      certificates(*),
      notes:student_notes(*)
    `)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

function openStudentForm(student = null) {
  const groupId = student?.course_group_id || "";
  openModal({
    title: student ? "Edit student" : "Add student",
    subtitle: student ? "Update core enrollment and contact details." : "Related status and checklist records will be created automatically.",
    size: "medium",
    body: `
      <form id="student-form" class="form-grid">
        <label class="field"><span>First Name</span><input name="first_name" value="${escapeAttr(student?.first_name || "")}" required maxlength="80"></label>
        <label class="field"><span>Last Name</span><input name="last_name" value="${escapeAttr(student?.last_name || "")}" required maxlength="80"></label>
        <label class="field"><span>Email</span><input name="email" type="email" value="${escapeAttr(student?.email || "")}" required maxlength="180"></label>
        <label class="field"><span>Phone</span><input name="phone" value="${escapeAttr(student?.phone || "")}" maxlength="40"></label>
        <label class="field"><span>Course Group</span><select name="course_group_id" required>
          <option value="">Select course group</option>${optionsHtml(state.courseGroups.filter(c => c.status === "Active" || c.id === groupId).map(c => [c.id, `${c.code} — ${c.name}`]), groupId)}
        </select></label>
        <label class="field"><span>Batch</span><select name="batch_id" required><option value="">Select a course group first</option></select></label>
        <label class="field"><span>Plan</span><select name="training_plan">${optionsHtml(APP.planOptions, studentPlan(student || {}))}</select></label>
        <label class="field span-2"><span>Coach</span><input name="coach" value="${escapeAttr(student?.coach || "")}" placeholder="Coach name" maxlength="120"></label>
      </form>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--primary" id="save-student">${student ? "Save changes" : "Add student"}</button>`
  });
  const form = $("#student-form");
  const batchSelect = form.elements.batch_id;
  const refreshBatches = selected => {
    const courseId = form.elements.course_group_id.value;
    const options = state.batches.filter(b => b.course_group_id === courseId && (b.status === "Active" || b.id === selected));
    batchSelect.innerHTML = `<option value="">Select batch</option>${optionsHtml(options.map(b => [b.id, b.name]), selected)}`;
  };
  form.elements.course_group_id.addEventListener("change", () => refreshBatches(""));
  refreshBatches(student?.batch_id || "");
  $("#save-student").addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    const values = formValues(form);
    values.email = values.email.trim().toLowerCase();
    Object.keys(values).forEach(key => { if (values[key] === "") values[key] = null; });
    setButtonLoading($("#save-student"), true, "Saving…");
    const operation = student
      ? state.supabase.from("students").update(values).eq("id", student.id).select().single()
      : state.supabase.from("students").insert(values).select().single();
    const { data, error } = await operation;
    if (error) {
      setButtonLoading($("#save-student"), false);
      return toast("Could not save student", friendlyError(error), "error");
    }
    closeModal();
    toast(student ? "Student updated" : "Student added", `${values.first_name} ${values.last_name} is saved in Supabase.`, "success");
    if (state.route === "students") renderStudents();
    else if (state.route === "dashboard") renderDashboard();
    if (!student && data?.id) openStudentProfile(data.id);
  });
}

function confirmBulkDelete(ids) {
  if (!ids.length) return;
  openConfirm({
    title: `Delete ${ids.length} student${ids.length === 1 ? "" : "s"}?`,
    message: "This permanently deletes the selected student records and all related finance, admin, coaching, requirement, certificate, and note data. This cannot be undone.",
    confirmLabel: ids.length === 1 ? "Delete student" : `Delete ${ids.length} students`,
    onConfirm: async button => {
      setButtonLoading(button, true, "Deleting…");
      const { error } = await state.supabase.from("students").delete().in("id", ids);
      if (error) {
        setButtonLoading(button, false);
        return toast("Could not delete students", friendlyError(error), "error");
      }
      state.selectedStudents.clear();
      closeModal();
      toast("Students deleted", `${ids.length} record${ids.length === 1 ? "" : "s"} removed.`, "success");
      if (state.route === "students") renderStudents();
      else renderRoute(state.route);
    }
  });
}

/* ---------- Student profile ---------- */

async function openStudentProfile(id, tab = "overview") {
  openModal({
    title: "Loading student",
    subtitle: "Fetching the latest record from Supabase…",
    size: "wide",
    body: loadingState("Loading profile…")
  });
  try {
    state.profile = await fetchStudent(id);
    state.profileTab = tab;
    renderStudentProfile();
  } catch (error) {
    closeModal();
    toast("Could not open student", friendlyError(error), "error");
  }
}

function renderStudentProfile() {
  const s = state.profile;
  const overall = s.admin?.student_status || "Active";
  $("#modal-root").innerHTML = `
    <div class="modal-backdrop">
      <section class="modal modal--wide profile-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(fullName(s))}">
        <div class="profile-header">
          <span class="profile-avatar">${initials(fullName(s))}</span>
          <div class="profile-title">
            <h2>${escapeHtml(fullName(s))}</h2>
            <p>${escapeHtml(s.email || "No email")} · ${escapeHtml(s.phone || "No phone")}</p>
            <div class="profile-header-meta">
              <span class="badge badge--teal">${escapeHtml(s.course_group?.code || "No course")}</span>
              <span class="badge badge--neutral">${escapeHtml(s.batch?.name || "No batch")}</span>
              ${statusBadge(studentPlan(s))}
              ${statusBadge(overall)}
            </div>
          </div>
          <button class="icon-btn" data-close-modal aria-label="Close profile"><span data-icon="x"></span></button>
        </div>
        <nav class="profile-tabs">
          ${["overview", "plan", "finance", "admin", "coaches", "requirements", "certificates", "notes"].map(tab => `<button class="profile-tab ${state.profileTab === tab ? "active" : ""}" data-profile-tab="${tab}">${titleCase(tab)}</button>`).join("")}
        </nav>
        <div id="profile-content" class="profile-content">${profileTabHtml(state.profileTab)}</div>
      </section>
    </div>
  `;
  renderIcons($("#modal-root"));
  bindModalBase();
  $$("[data-profile-tab]").forEach(btn => btn.addEventListener("click", () => {
    state.profileTab = btn.dataset.profileTab;
    $$(".profile-tab").forEach(t => t.classList.toggle("active", t === btn));
    $("#profile-content").innerHTML = profileTabHtml(state.profileTab);
    renderIcons($("#profile-content"));
    bindProfileTab();
  }));
  bindProfileTab();
}

function profileTabHtml(tab) {
  const s = state.profile;
  const renderers = {
    overview: () => `
      <div class="profile-section-head"><h3>Student overview</h3><button class="btn btn--outline btn--compact" id="profile-edit-student"><span data-icon="edit-2"></span>Edit details</button></div>
      <div class="detail-grid">
        ${detailItem("Full name", fullName(s))}
        ${detailItem("Email", s.email)}
        ${detailItem("Phone", s.phone)}
        ${detailItem("Course group", `${s.course_group?.code || "—"} — ${s.course_group?.name || "—"}`)}
        ${detailItem("Batch", s.batch?.name)}
        ${detailItem("Plan", studentPlan(s))}
        ${detailItem("Coach", s.coach || "Unassigned")}
        ${detailItem("Finance", s.finance?.payment_status)}
        ${detailItem("Student status", s.admin?.student_status)}
        ${detailItem("Requirements", s.requirements?.overall_status)}
        ${detailItem("Created", formatDate(s.created_at))}
        ${detailItem("Last updated", formatDateTime(s.updated_at))}
      </div>`,
    plan: () => planTabHtml(s),
    finance: () => financeTabHtml(s.finance || {}),
    admin: () => adminTabHtml(s.admin || {}),
    coaches: () => coachesTabHtml(s),
    requirements: () => requirementsTabHtml(s.requirements || {}),
    certificates: () => certificatesTabHtml(s.certificates || []),
    notes: () => notesTabHtml(s.notes || [])
  };
  return renderers[tab]();
}

function planTabHtml(student) {
  const plan = studentPlan(student);
  const intensiveCount = activeActivityCountForStudent({ ...student, training_plan: "2 Weeks" });
  const oneMonthCount = activeActivityCountForStudent({ ...student, training_plan: "1 Month" });
  return `
    <h3>Student plan</h3>
    <div class="requirement-banner ${plan === "1 Month" ? "requirement-banner--ready" : "requirement-banner--review"}">
      <div>
        <strong>${escapeHtml(plan)}</strong>
        <small>${plan === "1 Month" ? "This student will see Intensive + CAP activities." : "This student will see Intensive activities only."}</small>
      </div>
      <span data-icon="${plan === "1 Month" ? "calendar-check" : "calendar"}"></span>
    </div>
    <form id="profile-plan-form" class="form-grid">
      <label class="field"><span>Plan</span><select name="training_plan">${optionsHtml(APP.planOptions, plan)}</select></label>
      <div class="detail-item">
        <small>2 Weeks</small>
        <strong>Intensive activities only (${intensiveCount})</strong>
      </div>
      <div class="detail-item">
        <small>1 Month</small>
        <strong>Intensive + CAP activities (${oneMonthCount})</strong>
      </div>
      <div class="inline-alert span-2">Changing the plan adds missing checklist rows automatically. Existing activity history is kept; CAP rows are hidden when the student is tagged as 2 Weeks.</div>
    </form>
    <div class="page-actions"><button class="btn btn--primary" id="save-profile-plan">Save Plan</button></div>`;
}

function financeTabHtml(record) {
  return `
    <h3>Finance status</h3>
    <form id="profile-finance-form" class="form-grid">
      <label class="field"><span>Payment Status</span><select name="payment_status">${optionsHtml(APP.financeStatuses, record.payment_status || "Pending Payment")}</select></label>
      <label class="field"><span>Payment Method</span><select name="payment_method"><option value="">Select method</option>${optionsHtml(["GCash", "Bank Transfer", "PayPal", "Cash", "Other"], record.payment_method)}</select></label>
      <label class="field"><span>Amount Paid</span><input name="amount_paid" type="number" min="0" step="0.01" value="${escapeAttr(record.amount_paid ?? "0")}"></label>
      <label class="field"><span>Balance</span><input name="balance" type="number" min="0" step="0.01" value="${escapeAttr(record.balance ?? "0")}"></label>
      <label class="field"><span>Payment Date</span><input name="payment_date" type="date" value="${record.payment_date || ""}"></label>
      <label class="field span-2"><span>Finance Notes</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
    </form>
    <div class="page-actions"><button class="btn btn--primary" id="save-profile-finance">Save Finance Status</button></div>`;
}

function adminTabHtml(record) {
  return `
    <h3>Admin status & concerns</h3>
    <form id="profile-admin-form" class="form-grid">
      <label class="field"><span>Student Status</span><select name="student_status">${optionsHtml(APP.studentStatuses, record.student_status || "Active")}</select></label>
      <label class="field"><span>Concern Type</span><select name="concern_type"><option value="">No current concern</option>${optionsHtml(["Payment", "Attendance", "Coach Concern", "Technical Issue", "Behavior", "Other"], record.concern_type)}</select></label>
      <label class="field"><span>Concern Status</span><select name="concern_status">${optionsHtml(["Open", "In Progress", "Resolved"], record.concern_status || "Resolved")}</select></label>
      <label class="field"><span>Priority</span><select name="priority">${optionsHtml(["Low", "Medium", "High"], record.priority || "Low")}</select></label>
      <label class="field span-2"><span>Concern Details</span><textarea name="concern_details">${escapeHtml(record.concern_details || "")}</textarea></label>
      <label class="field span-2"><span>Admin Notes</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
    </form>
    <div class="page-actions"><button class="btn btn--primary" id="save-profile-admin">Save Admin Status</button></div>`;
}

function coachesTabHtml(student) {
  const classroom = student.classroom || {};
  const activityRows = relevantStudentActivities(student);
  const expectedActivities = activeActivityCountForStudent(student);
  return `
    <h3>Google Classroom checklist</h3>
    <form id="profile-classroom-form" class="form-grid">
      <label class="field"><span>Google Classroom Invite Sent</span><select name="invite_status">${optionsHtml(["Yes", "No", "Pending"], classroom.invite_status || "Pending")}</select></label>
      <label class="field"><span>Date Sent</span><input name="date_sent" type="date" value="${classroom.date_sent || ""}"></label>
      <label class="field"><span>Sent By</span><input name="sent_by" value="${escapeAttr(classroom.sent_by || "")}"></label>
      <label class="field span-2"><span>Notes</span><textarea name="notes">${escapeHtml(classroom.notes || "")}</textarea></label>
    </form>
    <div class="page-actions"><button class="btn btn--primary btn--compact" id="save-profile-classroom">Save Classroom Checklist</button></div>
    <div class="profile-section-head"><h3>Activities checklist</h3><small class="muted">${activityRows.filter(a => a.status === "Pass").length} of ${Math.max(activityRows.length, expectedActivities)} passed</small></div>
    <div class="activity-list">
      ${activityRows.length ? activityRows.map(row => `
        <form class="activity-row" data-activity-row="${row.id}">
          <div class="activity-name">${escapeHtml(row.activity?.name || "Activity")}<small>${escapeHtml(row.activity ? activityTrack(row.activity) : "Activity")}</small></div>
          <label class="field"><span>Status</span><select name="status">${optionsHtml(APP.activityStatuses, row.status || "Pending")}</select></label>
          <label class="field"><span>Score</span><input name="score" type="number" min="0" max="100" value="${escapeAttr(row.score ?? "")}"></label>
          <label class="field"><span>Coach Notes</span><input name="coach_notes" value="${escapeAttr(row.coach_notes || "")}"></label>
          <label class="field"><span>Date Checked</span><input name="date_checked" type="date" value="${row.date_checked || ""}"></label>
          <button class="btn btn--outline btn--compact save-activity" type="button">Save</button>
        </form>`).join("") : `<div class="inline-alert">No activity rows exist. Confirm that the database trigger and default activities were installed from the SQL schema.</div>`}
    </div>`;
}

function requirementsTabHtml(record) {
  const ready = record.overall_status === "Certificate Ready";
  return `
    <div class="requirement-banner ${ready ? "requirement-banner--ready" : "requirement-banner--review"}">
      <div><strong>${escapeHtml(record.overall_status || "For Review")}</strong><small>${ready ? "All six certificate conditions are met." : "The status is calculated automatically from the six conditions below."}</small></div>
      <span data-icon="${ready ? "check-circle" : "alert-circle"}"></span>
    </div>
    <form id="profile-requirements-form" class="form-grid">
      <label class="field"><span>Attendance Status</span><select name="attendance_status">${optionsHtml(["Met", "Not Met", "Pending"], record.attendance_status || "Pending")}</select></label>
      <label class="field"><span>Activity Score Status</span><select name="activity_score_status">${optionsHtml(["Passed", "Failed", "Pending"], record.activity_score_status || "Pending")}</select></label>
      <label class="field"><span>Readiness Status</span><select name="readiness_status">${optionsHtml(["Ready", "Not Ready", "Pending"], record.readiness_status || "Pending")}</select></label>
      <label class="field"><span>Coach Approval</span><select name="coach_approval">${optionsHtml(["Approved", "Not Approved", "Pending"], record.coach_approval || "Pending")}</select></label>
      <label class="field"><span>Admin Clearance</span><select name="admin_clearance">${optionsHtml(["Cleared", "Hold", "Pending"], record.admin_clearance || "Pending")}</select></label>
      <label class="field"><span>Finance Clearance</span><select name="finance_clearance">${optionsHtml(["Cleared", "Hold", "Pending"], record.finance_clearance || "Pending")}</select></label>
    </form>
    <div class="page-actions"><button class="btn btn--primary" id="save-profile-requirements">Save Requirements</button></div>`;
}

function certificatesTabHtml(records) {
  const types = ["Intensive Training Certificate", "Career Accelerator Program Certificate"];
  const byType = Object.fromEntries(records.map(r => [r.certificate_type, r]));
  return `
    <h3>Certificate records</h3>
    ${types.map(type => {
      const r = byType[type] || { certificate_type: type };
      return `
        <form class="certificate-card certificate-form" data-certificate-id="${r.id || ""}" data-certificate-type="${escapeAttr(type)}">
          <div class="certificate-card-head"><h4>${escapeHtml(type)}</h4>${statusBadge(r.status || "Not Eligible")}</div>
          <div class="form-grid form-grid--3">
            <label class="field"><span>Status</span><select name="status">${optionsHtml(APP.certificateStatuses, r.status || "Not Eligible")}</select></label>
            <label class="field"><span>Certificate Issued Date</span><input name="issued_date" type="date" value="${r.issued_date || ""}"></label>
            <label class="field"><span>Certificate Number</span><input name="certificate_number" value="${escapeAttr(r.certificate_number || "")}"></label>
            <label class="field"><span>Issued By</span><input name="issued_by" value="${escapeAttr(r.issued_by || "")}"></label>
            <label class="field span-2"><span>Notes</span><textarea name="notes">${escapeHtml(r.notes || "")}</textarea></label>
          </div>
          <div class="page-actions"><button class="btn btn--outline btn--compact save-certificate" type="button">Save certificate</button></div>
        </form>`;
    }).join("")}`;
}

function notesTabHtml(notes) {
  const sorted = [...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return `
    <h3>Student notes</h3>
    <div class="note-compose">
      <label class="field"><span>Add a note</span><textarea id="new-note" rows="3" placeholder="Write an internal note…"></textarea></label>
      <button class="btn btn--primary" id="add-note">Add note</button>
    </div>
    <div class="notes-list">
      ${sorted.length ? sorted.map(note => `<article class="note-item"><p>${escapeHtml(note.note)}</p><small>${formatDateTime(note.created_at)}${note.created_by ? ` · ${escapeHtml(note.created_by)}` : ""}</small></article>`).join("") : emptyState("file-text", "No notes yet", "Add the first internal note for this student.")}
    </div>`;
}

function bindProfileTab() {
  $("#profile-edit-student")?.addEventListener("click", () => openStudentForm(state.profile));
  $("#save-profile-plan")?.addEventListener("click", saveProfilePlan);
  $("#save-profile-finance")?.addEventListener("click", () => saveProfileRecord("finance_records", "#profile-finance-form", state.profile.finance?.id, "Finance status saved"));
  $("#save-profile-admin")?.addEventListener("click", () => saveProfileRecord("admin_records", "#profile-admin-form", state.profile.admin?.id, "Admin status saved"));
  $("#save-profile-classroom")?.addEventListener("click", () => saveProfileRecord("classroom_records", "#profile-classroom-form", state.profile.classroom?.id, "Classroom checklist saved"));
  $("#save-profile-requirements")?.addEventListener("click", saveRequirements);
  $$(".save-activity").forEach(button => button.addEventListener("click", () => saveActivity(button)));
  $$(".save-certificate").forEach(button => button.addEventListener("click", () => saveCertificate(button)));
  $("#add-note")?.addEventListener("click", addStudentNote);
}

async function saveProfilePlan() {
  const form = $("#profile-plan-form");
  if (!form.reportValidity()) return;
  const values = normalizedFormValues(form);
  const button = $("#save-profile-plan");
  setButtonLoading(button, true, "Saving...");
  const { error } = await state.supabase
    .from("students")
    .update({ training_plan: values.training_plan })
    .eq("id", state.profile.id);
  if (error) {
    setButtonLoading(button, false);
    return toast("Could not save plan", friendlyError(error), "error");
  }
  toast("Plan saved", values.training_plan === "1 Month" ? "CAP activities are now included for this student." : "Only Intensive activities will show for this student.", "success");
  await refreshProfile();
  if (state.route === "coach-checklist") renderCoachChecklist();
  if (state.route === "students") renderStudents();
  if (state.route === "dashboard") renderDashboard();
}

async function saveProfileRecord(table, formSelector, recordId, successTitle) {
  const form = $(formSelector);
  if (!form.reportValidity()) return;
  const values = normalizedFormValues(form);
  const button = form.parentElement.querySelector(".btn--primary");
  setButtonLoading(button, true, "Saving…");
  const payload = { ...values, student_id: state.profile.id };
  const operation = recordId
    ? state.supabase.from(table).update(values).eq("id", recordId)
    : state.supabase.from(table).upsert(payload, { onConflict: "student_id" });
  const { error } = await operation;
  if (error) {
    setButtonLoading(button, false);
    return toast("Could not save record", friendlyError(error), "error");
  }
  toast(successTitle, "The latest values are in Supabase.", "success");
  await refreshProfile();
}

async function saveRequirements() {
  const form = $("#profile-requirements-form");
  const values = normalizedFormValues(form);
  values.overall_status = certificateReadiness(values);
  const button = $("#save-profile-requirements");
  setButtonLoading(button, true, "Saving…");
  const payload = { ...values, student_id: state.profile.id };
  const operation = state.profile.requirements?.id
    ? state.supabase.from("requirements").update(values).eq("id", state.profile.requirements.id)
    : state.supabase.from("requirements").upsert(payload, { onConflict: "student_id" });
  const { error } = await operation;
  if (error) {
    setButtonLoading(button, false);
    return toast("Could not save requirements", friendlyError(error), "error");
  }
  toast("Requirements saved", `Overall status: ${values.overall_status}.`, "success");
  await refreshProfile();
}

function certificateReadiness(values) {
  if (values.attendance_status === "Met" &&
    values.activity_score_status === "Passed" &&
    values.readiness_status === "Ready" &&
    values.coach_approval === "Approved" &&
    values.admin_clearance === "Cleared" &&
    values.finance_clearance === "Cleared") return "Certificate Ready";
  if (values.attendance_status === "Not Met" ||
    values.activity_score_status === "Failed" ||
    values.readiness_status === "Not Ready" ||
    values.coach_approval === "Not Approved" ||
    values.admin_clearance === "Hold" ||
    values.finance_clearance === "Hold") return "Not Ready";
  return "For Review";
}

async function saveActivity(button) {
  const form = button.closest("[data-activity-row]");
  const values = normalizedFormValues(form);
  if (values.score !== null) values.score = Number(values.score);
  setButtonLoading(button, true, "Saving…");
  const { error } = await state.supabase.from("student_activities").update(values).eq("id", form.dataset.activityRow);
  if (error) {
    setButtonLoading(button, false);
    return toast("Could not save activity", friendlyError(error), "error");
  }
  toast("Activity saved", "Coach checklist updated.", "success");
  await refreshProfile();
}

async function saveCertificate(button) {
  const form = button.closest(".certificate-form");
  const values = normalizedFormValues(form);
  const id = form.dataset.certificateId;
  const payload = {
    ...values,
    student_id: state.profile.id,
    certificate_type: form.dataset.certificateType
  };
  setButtonLoading(button, true, "Saving…");
  const operation = id
    ? state.supabase.from("certificates").update(values).eq("id", id)
    : state.supabase.from("certificates").upsert(payload, { onConflict: "student_id,certificate_type" });
  const { error } = await operation;
  if (error) {
    setButtonLoading(button, false);
    return toast("Could not save certificate", friendlyError(error), "error");
  }
  toast("Certificate saved", `${payload.certificate_type} updated.`, "success");
  await refreshProfile();
}

async function addStudentNote() {
  const input = $("#new-note");
  const note = input.value.trim();
  if (!note) return toast("Write a note first", "The note cannot be empty.", "warning");
  const button = $("#add-note");
  setButtonLoading(button, true, "Adding…");
  const { error } = await state.supabase.from("student_notes").insert({
    student_id: state.profile.id,
    note,
    created_by: state.session?.user?.email || null
  });
  if (error) {
    setButtonLoading(button, false);
    return toast("Could not add note", friendlyError(error), "error");
  }
  toast("Note added", "The student timeline has been updated.", "success");
  await refreshProfile();
}

async function refreshProfile() {
  const id = state.profile.id;
  const tab = state.profileTab;
  state.profile = await fetchStudent(id);
  state.profileTab = tab;
  renderStudentProfile();
}

/* ---------- CSV import ---------- */

function openCsvImport() {
  openModal({
    title: "Import students from CSV",
    subtitle: "Designed for 600+ rows. Batches and related student records are created automatically.",
    size: "medium",
    body: `
      <input id="csv-file" type="file" accept=".csv,text/csv" class="hidden">
      <label class="dropzone" id="csv-dropzone" for="csv-file">
        <span data-icon="upload-cloud"></span>
        <h3>Drop a CSV here or click to browse</h3>
        <p>Required: first_name, last_name, email, course_group, batch_month, batch_year, batch_number. Optional: training_plan.</p>
      </label>
      <div class="page-actions" style="justify-content:flex-start;margin-top:10px">
        <button class="action-link" id="download-template" type="button"><span data-icon="download"></span> Download CSV template</button>
      </div>
      <div id="csv-preview"></div>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--primary" id="run-import" disabled>Import students</button>`
  });
  let parsed = null;
  const fileInput = $("#csv-file");
  const dropzone = $("#csv-dropzone");
  fileInput.addEventListener("change", async () => {
    if (!fileInput.files[0]) return;
    parsed = await previewCsv(fileInput.files[0]);
  });
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", async event => {
    const file = event.dataTransfer.files[0];
    if (file) parsed = await previewCsv(file);
  });
  $("#download-template").addEventListener("click", downloadCsvTemplate);
  $("#run-import").addEventListener("click", () => importCsvRows(parsed));
}

async function previewCsv(file) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    toast("Choose a CSV file", "Only .csv files are supported.", "warning");
    return null;
  }
  const text = await file.text();
  let rows;
  try {
    rows = parseCsv(text);
  } catch (error) {
    toast("Could not read CSV", error.message, "error");
    return null;
  }
  const required = ["first_name", "last_name", "email", "course_group", "batch_month", "batch_year", "batch_number"];
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length) {
    $("#csv-preview").innerHTML = `<div class="skip-list"><strong>Missing required columns:</strong> ${missing.map(escapeHtml).join(", ")}</div>`;
    $("#run-import").disabled = true;
    return null;
  }
  const validation = validateCsvRows(rows);
  $("#csv-preview").innerHTML = `
    <div class="import-summary">
      <div><strong>${rows.length}</strong><span>Total rows</span></div>
      <div><strong class="text-success">${validation.valid.length}</strong><span>Ready to import</span></div>
      <div><strong class="text-danger">${validation.skipped.length}</strong><span>Will be skipped</span></div>
    </div>
    ${validation.skipped.length ? `<div class="skip-list"><strong>Rows to skip</strong><br>${validation.skipped.slice(0, 25).map(s => `Row ${s.row}: ${escapeHtml(s.reason)}`).join("<br>")}${validation.skipped.length > 25 ? `<br>…and ${validation.skipped.length - 25} more` : ""}</div>` : ""}`;
  $("#run-import").disabled = !validation.valid.length;
  $("#run-import").textContent = `Import ${validation.valid.length} students`;
  return validation;
}

function validateCsvRows(rows) {
  const valid = [];
  const skipped = [];
  rows.forEach((raw, index) => {
    const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.trim().toLowerCase(), String(value ?? "").trim()]));
    const required = ["first_name", "last_name", "email", "course_group", "batch_month", "batch_year", "batch_number"];
    const absent = required.filter(key => !row[key]);
    if (absent.length) return skipped.push({ row: index + 2, reason: `Missing ${absent.join(", ")}` });
    const course = normalizeCourseCode(row.course_group);
    if (!state.courseGroups.some(group => group.code.toUpperCase() === course)) return skipped.push({ row: index + 2, reason: `Unknown course_group "${row.course_group}"` });
    const month = parseMonth(row.batch_month);
    if (!month) return skipped.push({ row: index + 2, reason: `Invalid batch_month "${row.batch_month}"` });
    const year = Number(row.batch_year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return skipped.push({ row: index + 2, reason: `Invalid batch_year "${row.batch_year}"` });
    const number = Number(row.batch_number);
    if (![1, 2].includes(number)) return skipped.push({ row: index + 2, reason: "batch_number must be 1 or 2" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return skipped.push({ row: index + 2, reason: `Invalid email "${row.email}"` });
    if (row.finance_status && !APP.financeStatuses.includes(row.finance_status)) return skipped.push({ row: index + 2, reason: `Invalid finance_status "${row.finance_status}"` });
    if (row.student_status && !APP.studentStatuses.includes(row.student_status)) return skipped.push({ row: index + 2, reason: `Invalid student_status "${row.student_status}"` });
    const trainingPlan = normalizeTrainingPlan(row.training_plan || "2 Weeks");
    if (!trainingPlan) return skipped.push({ row: index + 2, reason: `Invalid training_plan "${row.training_plan}"` });
    row.training_plan = trainingPlan;
    valid.push({ row: index + 2, data: row, course, month, year, number });
  });
  return { valid, skipped };
}

async function importCsvRows(validation) {
  if (!validation?.valid?.length) return;
  const button = $("#run-import");
  setButtonLoading(button, true, "Preparing batches…");
  const neededBatches = new Map();
  validation.valid.forEach(item => {
    const group = state.courseGroups.find(g => g.code.toUpperCase() === item.course);
    const key = `${group.id}-${item.month}-${item.year}-${item.number}`;
    neededBatches.set(key, {
      course_group_id: group.id,
      month: item.month,
      year: item.year,
      batch_number: item.number,
      name: `${group.code} - ${APP.months[item.month - 1]} ${item.year} - Batch ${item.number}`,
      status: "Active"
    });
  });
  const { error: batchError } = await state.supabase
    .from("batches")
    .upsert([...neededBatches.values()], { onConflict: "course_group_id,month,year,batch_number", ignoreDuplicates: true });
  if (batchError) {
    setButtonLoading(button, false);
    return toast("Import stopped", `Could not prepare batches: ${friendlyError(batchError)}`, "error");
  }
  await loadLookups();
  const students = validation.valid.map(item => {
    const group = state.courseGroups.find(g => g.code.toUpperCase() === item.course);
    const batch = state.batches.find(b => b.course_group_id === group.id && b.month === item.month && b.year === item.year && b.batch_number === item.number);
    return {
      first_name: item.data.first_name,
      last_name: item.data.last_name,
      email: item.data.email.toLowerCase(),
      phone: item.data.phone || null,
      course_group_id: group.id,
      batch_id: batch?.id,
      coach: item.data.coach || null,
      training_plan: item.data.training_plan || "2 Weeks"
    };
  }).filter(s => s.batch_id);
  let imported = 0;
  const insertedStudents = [];
  const errors = [];
  for (let index = 0; index < students.length; index += 200) {
    const chunk = students.slice(index, index + 200);
    setButtonLoading(button, true, `Importing ${Math.min(index + chunk.length, students.length)} / ${students.length}…`);
    const { data, error } = await state.supabase.from("students").upsert(chunk, { onConflict: "email", ignoreDuplicates: true }).select("id,email");
    if (error) errors.push(`Rows ${index + 2}–${index + chunk.length + 1}: ${friendlyError(error)}`);
    else {
      imported += data?.length || 0;
      insertedStudents.push(...(data || []));
    }
  }
  if (insertedStudents.length) {
    setButtonLoading(button, true, "Applying imported statuses…");
    const byEmail = new Map(validation.valid.map(item => [item.data.email.toLowerCase(), item.data]));
    const financeRows = insertedStudents
      .map(student => ({ student_id: student.id, payment_status: byEmail.get(student.email)?.finance_status }))
      .filter(row => APP.financeStatuses.includes(row.payment_status));
    const adminRows = insertedStudents
      .map(student => ({ student_id: student.id, student_status: byEmail.get(student.email)?.student_status }))
      .filter(row => APP.studentStatuses.includes(row.student_status));
    if (financeRows.length) {
      const { error } = await state.supabase.from("finance_records").upsert(financeRows, { onConflict: "student_id" });
      if (error) errors.push(`Finance statuses: ${friendlyError(error)}`);
    }
    if (adminRows.length) {
      const { error } = await state.supabase.from("admin_records").upsert(adminRows, { onConflict: "student_id" });
      if (error) errors.push(`Student statuses: ${friendlyError(error)}`);
    }
  }
  $("#csv-preview").innerHTML = `
    <div class="import-summary">
      <div><strong class="text-success">${imported}</strong><span>Imported</span></div>
      <div><strong>${students.length - imported}</strong><span>Duplicates skipped</span></div>
      <div><strong class="text-danger">${validation.skipped.length + errors.length}</strong><span>Errors / invalid</span></div>
    </div>
    ${errors.length ? `<div class="skip-list">${errors.map(escapeHtml).join("<br>")}</div>` : ""}`;
  button.disabled = true;
  button.textContent = "Import complete";
  toast("CSV import complete", `${imported} new student${imported === 1 ? "" : "s"} saved to Supabase.`, errors.length ? "warning" : "success");
  if (state.route === "students") {
    state.studentsPage = 1;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const normalized = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const nonEmpty = rows.filter(r => r.some(value => String(value).trim()));
  if (nonEmpty.length < 2) throw new Error("The CSV needs a header and at least one data row.");
  const headers = nonEmpty.shift().map(h => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column names.");
  return nonEmpty.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function downloadCsvTemplate() {
  const header = "first_name,last_name,email,phone,course_group,batch_month,batch_year,batch_number,training_plan,coach,finance_status,student_status";
  const example = "Juan,Dela Cruz,juan@example.com,09171234567,USBK,July,2026,1,1 Month,Coach Name,Pending Payment,Active";
  downloadFile("sync2va-student-import-template.csv", `${header}\r\n${example}\r\n`, "text/csv;charset=utf-8");
}

/* ---------- Exports ---------- */

async function exportStudents(filters = {}, filename = "sync2va-students.csv") {
  toast("Preparing export", "Fetching matching records from Supabase…", "warning", 1800);
  let query = state.supabase.from("students").select(`
    first_name,last_name,email,phone,coach,training_plan,created_at,updated_at,course_group_id,batch_id,
    course_group:course_groups(code,name),
    batch:batches(name,month,year,batch_number),
    finance:finance_records!inner(payment_status,amount_paid,balance,payment_method,payment_date),
    admin:admin_records!inner(student_status,concern_type,concern_status,priority),
    requirements:requirements!inner(attendance_status,activity_score_status,readiness_status,coach_approval,admin_clearance,finance_clearance,overall_status),
    certificates:certificates!inner(certificate_type,status,issued_date,certificate_number,issued_by)
  `);
  if (filters.courseGroup) query = query.eq("course_group_id", filters.courseGroup);
  if (filters.batch) query = query.eq("batch_id", filters.batch);
  if ((filters.month || filters.year) && !filters.batch) query = query.in("batch_id", batchIdsForPeriod(filters.month, filters.year, filters.courseGroup));
  if (filters.plan) query = query.eq("training_plan", filters.plan);
  if (filters.finance) query = query.eq("finance.payment_status", filters.finance);
  if (filters.admin) query = query.eq("admin.student_status", filters.admin);
  if (filters.requirement) query = query.eq("requirements.overall_status", filters.requirement);
  if (filters.certificate) query = query.eq("certificates.status", filters.certificate);
  if (filters.search) {
    const term = sanitizeSearch(filters.search);
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data, error } = await query.order("last_name").limit(10000);
  if (error) return toast("Export failed", friendlyError(error), "error");
  const rows = (data || []).map(s => {
    const intensive = s.certificates?.find(c => c.certificate_type === "Intensive Training Certificate") || {};
    const cap = s.certificates?.find(c => c.certificate_type === "Career Accelerator Program Certificate") || {};
    return {
      first_name: s.first_name,
      last_name: s.last_name,
      email: s.email,
      phone: s.phone,
      course_group: s.course_group?.code,
      course_name: s.course_group?.name,
      batch_name: s.batch?.name,
      batch_month: APP.months[(s.batch?.month || 1) - 1],
      batch_year: s.batch?.year,
      batch_number: s.batch?.batch_number,
      training_plan: studentPlan(s),
      coach: s.coach,
      finance_status: s.finance?.payment_status,
      amount_paid: s.finance?.amount_paid,
      balance: s.finance?.balance,
      payment_method: s.finance?.payment_method,
      payment_date: s.finance?.payment_date,
      student_status: s.admin?.student_status,
      concern_type: s.admin?.concern_type,
      concern_status: s.admin?.concern_status,
      priority: s.admin?.priority,
      requirement_status: s.requirements?.overall_status,
      attendance_status: s.requirements?.attendance_status,
      activity_score_status: s.requirements?.activity_score_status,
      readiness_status: s.requirements?.readiness_status,
      coach_approval: s.requirements?.coach_approval,
      admin_clearance: s.requirements?.admin_clearance,
      finance_clearance: s.requirements?.finance_clearance,
      intensive_certificate_status: intensive.status,
      intensive_certificate_number: intensive.certificate_number,
      intensive_issued_date: intensive.issued_date,
      cap_certificate_status: cap.status,
      cap_certificate_number: cap.certificate_number,
      cap_issued_date: cap.issued_date,
      created_at: s.created_at,
      updated_at: s.updated_at
    };
  });
  downloadRowsAsCsv(filename, rows);
  toast("Export ready", `${rows.length} student${rows.length === 1 ? "" : "s"} included.`, "success");
}

function exportFinance(records) {
  const rows = records.map(r => ({
    student_name: fullName(r.student),
    email: r.student?.email,
    course_group: r.student?.course_group?.code,
    batch_name: r.student?.batch?.name,
    payment_status: r.payment_status,
    amount_paid: r.amount_paid,
    balance: r.balance,
    payment_method: r.payment_method,
    payment_date: r.payment_date,
    updated_at: r.updated_at
  }));
  downloadRowsAsCsv("sync2va-finance-report.csv", rows);
  toast("Finance export ready", `${rows.length} records included.`, "success");
}

function exportCertificateRecords(records) {
  const rows = records.map(r => ({
    student_name: fullName(r.student),
    email: r.student?.email,
    course_group: r.student?.course_group?.code,
    batch_name: r.student?.batch?.name,
    certificate_type: r.certificate_type,
    eligibility: r.student?.requirements?.overall_status,
    status: r.status,
    certificate_number: r.certificate_number,
    issued_date: r.issued_date,
    issued_by: r.issued_by,
    updated_at: r.updated_at
  }));
  downloadRowsAsCsv("sync2va-certificate-register.csv", rows);
  toast("Certificate export ready", `${rows.length} records included.`, "success");
}

function downloadRowsAsCsv(filename, rows) {
  if (!rows.length) return toast("Nothing to export", "No records matched this report.", "warning");
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(","))
  ].join("\r\n");
  downloadFile(filename, `\uFEFF${csv}\r\n`, "text/csv;charset=utf-8");
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const string = String(value);
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Setup and modal system ---------- */

function openSetupModal() {
  const config = getSupabaseConfig();
  openModal({
    title: "Configure Supabase",
    subtitle: "Use the public Project URL and anon key from Project Settings → API.",
    size: "small",
    body: `
      <form id="setup-form">
        <label class="field"><span>Supabase Project URL</span><input name="url" type="url" value="${escapeAttr(config.url)}" placeholder="https://your-project.supabase.co" required></label>
        <label class="field"><span>Supabase Anon Key</span><textarea name="key" rows="5" placeholder="Public anon key" required>${escapeHtml(config.key)}</textarea></label>
        <div class="inline-alert">Never use a service role key here. Run <code>supabase-schema.sql</code> in your project before signing in.</div>
      </form>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--primary" id="save-setup">Save & reload</button>`
  });
  $("#save-setup").addEventListener("click", () => {
    const form = $("#setup-form");
    if (!form.reportValidity()) return;
    const values = formValues(form);
    localStorage.setItem("sync2va_supabase_url", values.url.trim());
    localStorage.setItem("sync2va_supabase_anon_key", values.key.trim());
    location.reload();
  });
}

function openModal({ title, subtitle = "", body, footer = "", size = "" }) {
  $("#modal-root").innerHTML = `
    <div class="modal-backdrop">
      <section class="modal ${size ? `modal--${size}` : ""}" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
        <header class="modal-header">
          <div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
          <button class="icon-btn" data-close-modal aria-label="Close"><span data-icon="x"></span></button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}
      </section>
    </div>`;
  renderIcons($("#modal-root"));
  bindModalBase();
  setTimeout(() => $("#modal-root input:not([type=file]), #modal-root select, #modal-root textarea")?.focus(), 40);
}

function bindModalBase() {
  $$("[data-close-modal]", $("#modal-root")).forEach(button => button.addEventListener("click", closeModal));
  $(".modal-backdrop", $("#modal-root"))?.addEventListener("mousedown", event => {
    if (event.target.classList.contains("modal-backdrop")) closeModal();
  });
}

function closeModal() {
  $("#modal-root").innerHTML = "";
}

function openConfirm({ title, message, confirmLabel, onConfirm }) {
  openModal({
    title,
    size: "small",
    body: `<div class="confirm-copy"><span class="confirm-icon" data-icon="alert-triangle"></span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`,
    footer: `<button class="btn btn--outline" data-close-modal>Cancel</button><button class="btn btn--danger" id="confirm-danger">${escapeHtml(confirmLabel)}</button>`
  });
  $("#confirm-danger").addEventListener("click", () => onConfirm($("#confirm-danger")));
}

/* ---------- View helpers ---------- */

function metricCard(label, value, note, icon, color, accent = false) {
  return `<article class="card metric-card ${accent ? "metric-card--accent" : ""}">
    <div class="metric-top"><div><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(String(value))}</div><div class="metric-note">${escapeHtml(note)}</div></div><span class="metric-icon metric-icon--${color}" data-icon="${icon}"></span></div>
  </article>`;
}

function barList(items, total, compact = false) {
  if (!items.length) return emptyState("bar-chart", "No data yet", "Matching students will appear here.");
  const max = Math.max(...items.map(([, count]) => count), 1);
  return `<div class="bar-list">${items.map(([label, count], index) => `
    <div><div class="bar-row-head"><strong title="${escapeAttr(label)}">${escapeHtml(compact && label.length > 45 ? `${label.slice(0, 45)}…` : label)}</strong><span>${count} · ${percent(count, total)}%</span></div><div class="bar-track"><div class="bar-fill ${index % 4 === 1 ? "bar-fill--blue" : index % 4 === 2 ? "bar-fill--orange" : index % 4 === 3 ? "bar-fill--purple" : ""}" style="width:${(count / max) * 100}%"></div></div></div>`).join("")}</div>`;
}

function statusListRow(label, count, color) {
  return `<div class="status-list-row"><span class="status-list-label"><span class="status-dot status-dot--${color}"></span>${escapeHtml(label)}</span><strong>${count}</strong></div>`;
}

function groupCounts(items, keyFn) {
  const map = new Map();
  items.forEach(item => {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function selectControl(name, placeholder, items, selected = "") {
  return `<select class="control" name="${escapeAttr(name)}"><option value="">${escapeHtml(placeholder)}</option>${optionsHtml(items, selected)}</select>`;
}

function yearSelect(name, selected = "", placeholder = "All years") {
  const current = new Date().getFullYear();
  const batchYears = state.batches.map(b => b.year);
  const min = Math.min(current - 2, ...batchYears);
  const max = Math.max(current + 2, ...batchYears);
  const years = [];
  for (let year = max; year >= min; year--) years.push([year, year]);
  return selectControl(name, placeholder, years, selected);
}

function optionsHtml(items, selected = "") {
  return items.map(item => {
    const [value, label] = Array.isArray(item) ? item : [item, item];
    return `<option value="${escapeAttr(value)}" ${String(value) === String(selected ?? "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function filteredBatchOptions(courseGroupId) {
  return state.batches
    .filter(b => !courseGroupId || b.course_group_id === courseGroupId)
    .map(b => [b.id, b.name]);
}

function batchIdsForPeriod(month, year, courseGroupId = "") {
  const ids = state.batches
    .filter(batch =>
      (!month || batch.month === Number(month)) &&
      (!year || batch.year === Number(year)) &&
      (!courseGroupId || batch.course_group_id === courseGroupId)
    )
    .map(batch => batch.id);
  return ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
}

function pagination(total, page, totalPages, pageSize) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const pages = pageWindow(page, totalPages);
  return `<div class="pagination">
    <span class="pagination-info">Showing ${from}–${to} of ${total} students</span>
    <div class="pagination-buttons">
      <button class="page-btn" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="Previous page"><span data-icon="chevron-left"></span></button>
      ${pages.map(p => p === "…" ? `<span class="page-btn">…</span>` : `<button class="page-btn ${p === page ? "active" : ""}" data-page="${p}">${p}</button>`).join("")}
      <button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""} aria-label="Next page"><span data-icon="chevron-right"></span></button>
    </div>
  </div>`;
}

function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

function emptyState(icon, title, message, action = "") {
  return `<div class="empty-state"><span class="empty-icon" data-icon="${icon}"></span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${action}</div>`;
}

function detailItem(label, value) {
  return `<div class="detail-item"><small>${escapeHtml(label)}</small><strong title="${escapeAttr(value || "—")}">${escapeHtml(value || "—")}</strong></div>`;
}

function statusBadge(value) {
  const status = value || "—";
  const colors = {
    "Active": "green", "Completed": "blue", "Fully Paid": "green", "Issued": "green",
    "Certificate Ready": "green", "Met": "green", "Passed": "green", "Ready": "green",
    "Approved": "green", "Cleared": "green", "Yes": "green", "Pass": "green", "Resolved": "green",
    "Pending Payment": "yellow", "Pending": "yellow", "For Review": "yellow", "In Progress": "yellow",
    "On Hold": "yellow", "Downpayment Paid": "blue", "Intensive Training": "blue", "2 Weeks": "blue",
    "Inactive": "neutral", "Archived": "neutral", "Not Eligible": "neutral", "No": "neutral",
    "Dropped": "red", "Refunded": "red", "Failed": "red", "Fail": "red", "Not Ready": "red",
    "Not Met": "red", "Not Approved": "red", "Hold": "red", "Open": "red", "High": "red",
    "Retake": "orange", "Career Accelerator": "purple", "1 Month": "purple", "CAP": "purple"
  };
  return `<span class="badge badge--${colors[status] || "neutral"}">${escapeHtml(status)}</span>`;
}

function certificateSummary(certificates = []) {
  const priority = ["Issued", "Approved", "For Review", "Not Eligible"];
  return priority.find(status => certificates.some(c => c.status === status)) || "Not Eligible";
}

function loadingState(label = "Loading…") {
  return `<div class="page-loading"><span class="spinner"></span><p>${escapeHtml(label)}</p></div>`;
}

function renderPageError(error) {
  $("#page-content").innerHTML = `<section class="card">${emptyState("alert-triangle", "Could not load this page", friendlyError(error), `<button class="btn btn--outline btn--compact" id="retry-page">Try again</button>`)}</section>`;
  renderIcons($("#page-content"));
  $("#retry-page")?.addEventListener("click", () => renderRoute(state.route));
}

/* ---------- Data and formatting helpers ---------- */

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizedFormValues(form) {
  const values = formValues(form);
  Object.keys(values).forEach(key => {
    const value = typeof values[key] === "string" ? values[key].trim() : values[key];
    values[key] = value === "" ? null : value;
  });
  return values;
}

function setButtonLoading(button, loading, label = "Working…") {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:15px;height:15px;margin:0;border-width:2px"></span>${escapeHtml(label)}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    renderIcons(button);
  }
}

function fullName(student) {
  return [student?.first_name, student?.last_name].filter(Boolean).join(" ") || "Unnamed Student";
}

function initials(value) {
  const words = String(value || "A").trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "A") + (words.length > 1 ? words.at(-1)[0] : "");
}

function titleCase(value) {
  return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}`.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatRelativeDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  const seconds = Math.round((date - new Date()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return "Just now";
  const units = absolute < 3600 ? ["minute", 60] : absolute < 86400 ? ["hour", 3600] : absolute < 604800 ? ["day", 86400] : null;
  if (!units) return formatDate(value);
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(seconds / units[1]), units[0]);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function parseMonth(value) {
  const string = String(value || "").trim();
  const number = Number(string);
  if (Number.isInteger(number) && number >= 1 && number <= 12) return number;
  const index = APP.months.findIndex(month => month.toLowerCase() === string.toLowerCase() || month.slice(0, 3).toLowerCase() === string.slice(0, 3).toLowerCase());
  return index >= 0 ? index + 1 : 0;
}

function normalizeCourseCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeTrainingPlan(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (!normalized) return "2 Weeks";
  if (["2 weeks", "2 week", "two weeks", "two week"].includes(normalized)) return "2 Weeks";
  if (["1 month", "one month", "month"].includes(normalized)) return "1 Month";
  return APP.planOptions.find(plan => plan.toLowerCase() === normalized) || "";
}

function hasActiveFilters(filters) {
  return Object.values(filters || {}).some(Boolean);
}

function sanitizeSearch(value) {
  return String(value || "").replace(/[%_,().]/g, " ").trim();
}

function friendlyError(error) {
  const message = error?.message || String(error || "Unknown error");
  if (/Failed to fetch/i.test(message)) return "Could not reach Supabase. Check the project URL, internet connection, and browser console.";
  if (/Invalid API key|JWT/i.test(message)) return "The Supabase anon key is invalid or expired.";
  if (/relation .* does not exist/i.test(message)) return "The database schema is missing. Run supabase-schema.sql in the Supabase SQL Editor.";
  if (/column .*training_plan.*does not exist|column .*activity_track.*does not exist/i.test(message)) return "The database needs the latest Plan update. Run the updated supabase-schema.sql in the Supabase SQL Editor.";
  if (/duplicate key.*students_email/i.test(message) || /students_email_key/i.test(message)) return "A student with this email already exists.";
  if (/duplicate key/i.test(message)) return "This record already exists.";
  if (/row-level security/i.test(message)) return "Supabase blocked this request. Sign in and verify the RLS policies from the SQL schema.";
  return message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function toast(title, message = "", type = "default", duration = 4200) {
  const element = document.createElement("div");
  element.className = `toast ${type !== "default" ? `toast--${type}` : ""}`;
  element.innerHTML = `<span data-icon="${type === "success" ? "check-circle" : type === "error" ? "x-circle" : type === "warning" ? "alert-circle" : "info"}"></span><div class="toast-copy"><strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ""}</div><button aria-label="Dismiss"><span data-icon="x"></span></button>`;
  $("#toast-region").appendChild(element);
  renderIcons(element);
  const remove = () => element.remove();
  element.querySelector("button").addEventListener("click", remove);
  setTimeout(remove, duration);
}

/* ---------- Lightweight SVG icon set ---------- */

const iconPaths = {
  "alert-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  "alert-triangle": '<path d="M10.3 3.8 2.4 17.4A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.6L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "archive": '<path d="M3 6h18"/><path d="M5 6v14h14V6"/><path d="M9 10h6"/><path d="M4 3h16v3H4z"/>',
  "award": '<circle cx="12" cy="8" r="5"/><path d="m8.8 12.1-1.3 8 4.5-2.7 4.5 2.7-1.3-8"/>',
  "bar-chart": '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  "book": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  "check": '<path d="m5 12 4 4L19 6"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8"/>',
  "check-square": '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  "chevron-down": '<path d="m7 10 5 5 5-5"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  "download": '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  "edit-2": '<path d="M17 3a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m15 5 3 3"/>',
  "eye": '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  "grid": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  "help-circle": '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-.9.5-1.4 1-1.4 2.1"/><path d="M12 17h.01"/>',
  "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  "layers": '<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  "log-out": '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  "menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
  "plus": '<path d="M12 5v14M5 12h14"/>',
  "refresh-cw": '<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M5.6 8a8 8 0 0 1 13.1-2L20 7M4 17l1.3 1a8 8 0 0 0 13.1-2"/>',
  "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  "thumbs-up": '<path d="M7 10v12H3V10h4Z"/><path d="M7 20h10.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 18.7 9H15l.7-3.5A2.9 2.9 0 0 0 13 2l-1 4-5 4"/>',
  "trash": '<path d="M3 6h18M8 6V3h8v3M19 6l-1 15H6L5 6M10 11v5M14 11v5"/>',
  "trash-2": '<path d="M3 6h18M8 6V3h8v3M19 6l-1 15H6L5 6"/>',
  "trending-up": '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  "upload": '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 3h16"/>',
  "upload-cloud": '<path d="M16 16l-4-4-4 4M12 12v9"/><path d="M20.4 17.5A5 5 0 0 0 18 8.2 7 7 0 0 0 4.3 9.9 4 4 0 0 0 5 18h3"/>',
  "user-x": '<path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8" cy="7" r="4"/><path d="m18 8 5 5M23 8l-5 5"/>',
  "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
  "wallet": '<path d="M4 5h14a2 2 0 0 1 2 2v13H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12"/><path d="M16 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/>',
  "x": '<path d="M6 6l12 12M18 6 6 18"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'
};

function renderIcons(root = document) {
  $$("[data-icon]:not([data-icon-rendered])", root).forEach(element => {
    const path = iconPaths[element.dataset.icon] || iconPaths.info;
    element.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    element.dataset.iconRendered = "true";
  });
}
