import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.YT_DB_CONFIG || {};
const app = document.querySelector("#app");
const toastEl = document.querySelector("#toast");
const isConfigured =
  config.supabaseUrl &&
  config.supabaseAnonKey &&
  !config.supabaseUrl.includes("YOUR_PROJECT_ID") &&
  !config.supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY");

const supabase = isConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

const state = {
  route: resolveRoute(),
  session: null,
  adminTab: "dashboard",
  adminLoaded: false,
  homeLoaded: false,
  groups: [],
  members: [],
  announcements: [],
  servicePlans: [],
  siteSettings: null,
  editing: null,
  portal: null,
  portalAccessCode: null,
  selectedGroupId: null,
  memberPage: 1
};

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("keydown", handleKeydown);
window.addEventListener("popstate", () => {
  state.route = resolveRoute();
  state.editing = null;
  void render();
});

void init();

async function init() {
  if (!isConfigured) {
    renderConfigMissing();
    return;
  }

  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    state.adminLoaded = false;
    void render();
  });

  await render();
}

async function render() {
  renderTopNav();
  setActiveNav();
  if (!isConfigured) {
    renderConfigMissing();
    return;
  }
  if (state.route === "admin") {
    await renderAdmin();
    return;
  }
  if (state.route === "customer") {
    renderCustomer();
    return;
  }
  await renderHome();
}

function renderConfigMissing() {
  renderTopNav();
  setActiveNav();
  app.innerHTML = `
    <section class="empty-state">
      <h1>ยังไม่ได้ตั้งค่า Supabase</h1>
      <p>เปิดไฟล์ <strong>config.js</strong> แล้วใส่ Project URL และ anon public key จาก Supabase ก่อนใช้งาน</p>
    </section>
  `;
}

function resolveRoute() {
  const hashRoute = window.location.hash.replace("#", "");
  if (hashRoute === "admin" || hashRoute === "customer" || hashRoute === "home") return hashRoute;
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/customer")) return "customer";
  return "home";
}

function navigate(route) {
  const useHash = window.location.protocol === "file:";
  const url = useHash ? `#${route}` : route === "home" ? "/" : `/${route}`;
  window.history.pushState({}, "", url);
  state.route = route;
  state.editing = null;
  void render();
}

function setActiveNav() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === state.route);
  });
}

function renderTopNav() {
  const topnav = document.querySelector(".topnav");
  if (!topnav) return;

  if (state.route === "admin") {
    topnav.innerHTML = `
      <button type="button" data-nav="home">หน้าแรก</button>
      <button type="button" data-nav="customer">หน้าลูกค้า</button>
    `;
    return;
  }

  if (state.route === "customer") {
    topnav.innerHTML = `<button type="button" data-nav="home">หน้าแรก</button>`;
    return;
  }

  topnav.innerHTML = `<button type="button" data-nav="customer">เช็กข้อมูลสมาชิก</button>`;
}

async function renderAdmin() {
  if (!state.session) {
    state.adminLoaded = false;
    app.innerHTML = renderLogin();
    return;
  }

  if (!state.adminLoaded) {
    app.innerHTML = renderAdminShell(`
      <section class="empty-state">
        <h1>กำลังโหลดข้อมูลหลังบ้าน</h1>
      </section>
    `);

    try {
      await loadAdminData();
      state.adminLoaded = true;
    } catch (error) {
      app.innerHTML = renderAdminShell(`
        <section class="empty-state">
          <h1>ไม่สามารถโหลดข้อมูลได้</h1>
          <p>${escapeHtml(error.message)}</p>
          <div class="toolbar">
            <button class="ghost-button" type="button" data-action="refresh-admin">ลองโหลดใหม่</button>
            <button class="danger-button" type="button" data-action="logout">ออกจากระบบ</button>
          </div>
        </section>
      `);
      return;
    }
  }

  const content = {
    dashboard: renderDashboard(),
    groups: renderGroupsAdmin(),
    members: renderMembersAdmin(),
    announcements: renderAnnouncementsAdmin(),
    promo: renderPromoAdmin()
  }[state.adminTab];

  app.innerHTML = renderAdminShell(content);
}

function renderLogin() {
  return `
    <section class="customer-entry">
      <div class="section-block">
        <div class="section-header">
          <div>
            <h1>เข้าสู่ระบบผู้จัดการ</h1>
          </div>
        </div>
        <form class="form-grid" data-form="admin-login">
          <label class="field full">
            <span>อีเมล</span>
            <input name="email" type="email" autocomplete="email" required />
          </label>
          <label class="field full">
            <span>รหัสผ่าน</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <div class="toolbar full">
            <button class="primary-button" type="submit">เข้าสู่ระบบ</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderAdminShell(content) {
  const tabs = [
    ["dashboard", "ภาพรวม"],
    ["groups", "กลุ่ม"],
    ["members", "สมาชิก"],
    ["announcements", "ประกาศ/โปรโมชั่น"],
    ["promo", "หน้าโปรโมต"]
  ];

  return `
    <div class="admin-shell">
      <div class="page-header admin-header">
        <div>
          <span class="eyebrow">FKP Admin</span>
          <h1>ผู้จัดการระบบ</h1>
          <p>${escapeHtml(state.session?.user?.email || "")}</p>
        </div>
        <div class="toolbar">
          <button class="ghost-button" type="button" data-action="refresh-admin">โหลดใหม่</button>
          <button class="danger-button" type="button" data-action="logout">ออกจากระบบ</button>
        </div>
      </div>
      <div class="tabs admin-tabs">
        ${tabs
          .map(
            ([key, label]) => `
              <button class="tab ${state.adminTab === key ? "is-active" : ""}" type="button" data-tab="${key}">
                ${label}
              </button>
            `
          )
          .join("")}
      </div>
      ${content}
    </div>
  `;
}

function renderDashboard() {
  const activeGroups = state.groups.filter((group) => group.status === "active").length;
  const outstandingMembers = getOutstandingMembers();
  const paymentWatchMembers = getPaymentWatchMembers();

  return `
    <section class="section-block">
      <div class="grid stats-grid">
        ${renderStat("กลุ่มทั้งหมด", state.groups.length)}
        ${renderStat("กลุ่มใช้งานได้", activeGroups)}
        ${renderStat("สมาชิกทั้งหมด", state.members.length)}
        ${renderStat("ค้างชำระทั้งหมด", outstandingMembers.length)}
      </div>
    </section>

    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>ค้างชำระและใกล้ถึงวันชำระ</h2>
          <p>แสดงรายการที่ครบกำหนดแล้ว หรือครบกำหนดภายใน 7 วัน กดชำระแล้วเพื่อเลื่อนวันชำระไปอีก 1 เดือน</p>
        </div>
      </div>
      ${
        paymentWatchMembers.length
          ? renderMembersTable(paymentWatchMembers, { compact: true, paymentAction: true, showDueStatus: true })
          : `<div class="empty-state"><p>ยังไม่มีรายการค้างชำระหรือใกล้ถึงวันชำระ</p></div>`
      }
    </section>
  `;
}

async function renderHome() {
  if (!state.homeLoaded) {
    app.innerHTML = `
      <section class="empty-state">
        <h1>กำลังโหลดหน้าแรก</h1>
      </section>
    `;

    try {
      await loadHomeData();
      state.homeLoaded = true;
    } catch (error) {
      app.innerHTML = `
        <section class="empty-state">
          <h1>ไม่สามารถโหลดหน้าแรกได้</h1>
          <p>${escapeHtml(error.message)}</p>
        </section>
      `;
      return;
    }
  }

  const settings = getSiteSettings();
  const activePlanCount = state.servicePlans.filter((plan) => plan.is_active).length || 0;
  const availablePlanCount = state.servicePlans.filter((plan) => {
    const availability = getPlanAvailability(plan);
    return plan.is_active && availability.status !== "full";
  }).length;

  app.innerHTML = `
    <section class="promo-hero">
      <div class="promo-hero-copy">
        <h1>${escapeHtml(settings.hero_title)}</h1>
        <p>${escapeHtml(settings.hero_subtitle)}</p>
        <div class="hero-points" aria-label="จุดเด่นบริการ">
          <span>ราคาชัดเจน</span>
          <span>แจ้งสถานะว่าง/เต็ม</span>
          <span>ติดต่อร้านได้ทันที</span>
        </div>
        <div class="toolbar">
          ${settings.line_url ? `<a class="primary-button link-button" href="${attr(settings.line_url)}" target="_blank" rel="noopener">${escapeHtml(settings.line_label || "ติดต่อ LINE")}</a>` : ""}
          ${settings.facebook_url ? `<a class="ghost-button link-button" href="${attr(settings.facebook_url)}" target="_blank" rel="noopener">${escapeHtml(settings.facebook_label || "ติดต่อ Facebook")}</a>` : ""}
        </div>
      </div>
      <div class="promo-hero-panel">
        <div class="hero-mini-card primary">
          <span>พร้อมขาย</span>
          <strong>${availablePlanCount}</strong>
        </div>
        <div class="hero-mini-card">
          <span>บริการทั้งหมด</span>
          <strong>${activePlanCount}</strong>
        </div>
        <button class="ghost-button" type="button" data-nav="customer">เช็กข้อมูลสมาชิก</button>
      </div>
    </section>

    ${renderHomeAnnouncements(state.announcements || [])}
    ${renderServicePlans(state.servicePlans || [])}
    ${renderContactSection(settings)}
  `;
}

function renderHomeAnnouncements(items) {
  const activeItems = items.filter((item) => item.is_active !== false);
  if (!activeItems.length) return "";

  return `
    <section class="promo-section">
      <div class="section-header">
        <div>
          <h2>โปรโมชันและประกาศ</h2>
        </div>
      </div>
      <div class="announcement-strip">
        ${activeItems
          .map(
            (item) => `
              <article class="announcement-item">
                ${renderAnnouncementImage(item)}
                <div class="announcement-body">
                  <span class="badge">${escapeHtml(contentTypeLabel(item.content_type))}</span>
                  <h3>${escapeHtml(item.title)}</h3>
                  ${item.detail ? `<p class="muted">${escapeHtml(item.detail)}</p>` : ""}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAnnouncementImage(item) {
  if (!item.image_url) return "";

  return `
    <button
      class="announcement-image-button"
      type="button"
      data-action="open-image"
      data-src="${attr(item.image_url)}"
      data-title="${attr(item.title)}"
      aria-label="ดูรูปเต็ม ${attr(item.title)}"
    >
      <img src="${attr(item.image_url)}" alt="${attr(item.title)}" loading="lazy" />
    </button>
  `;
}

function renderServicePlans(plans) {
  const activePlans = plans.filter((plan) => plan.is_active !== false);
  if (!activePlans.length) {
    return `
      <section class="promo-section">
        <div class="empty-state">
          <h1>ยังไม่มีรายการบริการ</h1>
        </div>
      </section>
    `;
  }

  const settings = getSiteSettings();

  return `
    <section class="promo-section">
      <div class="section-header">
        <div>
          <h2>สินค้าและบริการ</h2>
        </div>
      </div>
      <div class="plan-grid">
        ${activePlans
          .map((plan) => {
            const availability = getPlanAvailability(plan);
            return `
              <article class="plan-card">
                <div class="plan-media">
                  ${
                    plan.image_url
                      ? `<img src="${attr(plan.image_url)}" alt="${attr(plan.title)}" />`
                      : `<div class="plan-media-empty">${escapeHtml(plan.title.slice(0, 2).toUpperCase())}</div>`
                  }
                  <span class="plan-availability">${renderPlanAvailabilityBadge(availability)}</span>
                </div>
                <div class="plan-card-body">
                  <div class="plan-title-row">
                    ${
                      plan.icon_url
                        ? `<img class="plan-icon" src="${attr(plan.icon_url)}" alt="" />`
                        : `<span class="plan-icon-text">${escapeHtml(plan.title.slice(0, 1).toUpperCase())}</span>`
                    }
                    <h3>${escapeHtml(plan.title)}</h3>
                  </div>
                  <p class="plan-description">${escapeHtml(plan.description || "รายละเอียดบริการ")}</p>
                  <div class="plan-meta-line">
                    <span>${escapeHtml(availability.label)}</span>
                  </div>
                  ${renderFeatureTags(plan.features)}
                  <div class="plan-card-footer">
                    <span>ราคา</span>
                    <strong class="plan-price">${escapeHtml(plan.price_label || "-")}</strong>
                  </div>
                  ${renderCompactPlanActions(settings, availability)}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderPlanActions(settings, availability) {
  if (!settings.line_url && !settings.facebook_url) return "";
  const isFull = availability.status === "full";

  return `
    <div class="plan-actions">
      ${
        settings.line_url
          ? `<a class="primary-button link-button ${isFull ? "is-disabled" : ""}" href="${attr(settings.line_url)}" target="_blank" rel="noopener">${isFull ? "สอบถามคิว" : escapeHtml(settings.line_label || "ติดต่อ LINE")}</a>`
          : ""
      }
      ${
        settings.facebook_url
          ? `<a class="ghost-button link-button" href="${attr(settings.facebook_url)}" target="_blank" rel="noopener">${escapeHtml(settings.facebook_label || "Facebook")}</a>`
          : ""
      }
    </div>
  `;
}

function renderCompactPlanActions(settings, availability) {
  if (!settings.line_url && !settings.facebook_url) return "";
  const isFull = availability.status === "full";

  return `
    <div class="plan-actions compact">
      ${
        settings.line_url
          ? `<a class="primary-button link-button ${isFull ? "is-disabled" : ""}" href="${attr(settings.line_url)}" target="_blank" rel="noopener">${isFull ? "สอบถามคิว" : "ติดต่อ"}</a>`
          : ""
      }
      ${
        settings.facebook_url
          ? `<a class="ghost-button link-button" href="${attr(settings.facebook_url)}" target="_blank" rel="noopener">FB</a>`
          : ""
      }
    </div>
  `;
}

function renderContactSection(settings) {
  if (!settings.line_url && !settings.facebook_url) return "";

  return `
    <section class="contact-band">
      <div>
        <span class="eyebrow">Contact</span>
        <h2>สนใจบริการหรือต้องการสอบถาม</h2>
      </div>
      <div class="toolbar">
        ${settings.line_url ? `<a class="primary-button link-button" href="${attr(settings.line_url)}" target="_blank" rel="noopener">${escapeHtml(settings.line_label || "ติดต่อ LINE")}</a>` : ""}
        ${settings.facebook_url ? `<a class="ghost-button link-button" href="${attr(settings.facebook_url)}" target="_blank" rel="noopener">${escapeHtml(settings.facebook_label || "ติดต่อ Facebook")}</a>` : ""}
      </div>
    </section>
  `;
}

function renderStat(label, value) {
  return `
    <div class="stat-box">
      <strong>${value}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderGroupsAdmin() {
  const record = getEditingRecord("group", state.groups);

  return `
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>${record ? "แก้ไขกลุ่ม" : "เพิ่มกลุ่ม"}</h2>
          <p>กำหนดชื่อกลุ่มและสถานะที่ฝั่งลูกค้าจะเห็น</p>
        </div>
      </div>
      <form class="form-grid group-form" data-form="group">
        <label class="field">
          <span>ชื่อกลุ่ม</span>
          <input name="group_name" value="${attr(record?.group_name)}" required />
        </label>
        <label class="field">
          <span>อีเมลหัวบ้าน</span>
          <input name="owner_account_email" type="email" value="${attr(record?.owner_account_email)}" placeholder="owner@example.com" />
          <small class="field-hint">ใช้เป็นอีเมลหลักของกลุ่ม ไม่ต้องใส่ซ้ำในสมาชิก</small>
        </label>
        <label class="field">
          <span>Password บัญชีหัวบ้าน</span>
          <input
            name="owner_account_password"
            type="password"
            autocomplete="new-password"
            placeholder="${record?.owner_account_password ? "ตั้งค่าไว้แล้ว - กรอกใหม่เมื่อต้องการเปลี่ยน" : "ใส่ Password บัญชีหัวบ้าน"}"
          />
          <small class="field-hint">${record ? "ปล่อยว่างเพื่อใช้ Password เดิม" : "เก็บเฉพาะหลังบ้าน ไม่แสดงให้ลูกค้าเห็น"}</small>
        </label>
        <label class="field">
          <span>สถานะ</span>
          <select name="status">
            ${option("active", "ใช้งานได้", record?.status)}
            ${option("maintenance", "ปรับปรุง", record?.status)}
          </select>
        </label>
        ${
          record
            ? `<label class="check-row full">
                <input name="clear_owner_account_password" type="checkbox" />
                <span>ลบ Password เดิม</span>
              </label>`
            : ""
        }
        <div class="toolbar full">
          <button class="primary-button" type="submit">${record ? "บันทึกการแก้ไข" : "เพิ่มกลุ่ม"}</button>
          ${record ? `<button class="ghost-button" type="button" data-action="cancel-edit">ยกเลิก</button>` : ""}
        </div>
      </form>
      ${renderGroupsTable()}
    </section>
  `;
}

function renderGroupsTable() {
  if (!state.groups.length) {
    return `<div class="empty-state"><p>ยังไม่มีกลุ่ม</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ชื่อกลุ่ม</th>
            <th>อีเมลหัวบ้าน</th>
            <th>Password หัวบ้าน</th>
            <th>สถานะ</th>
            <th>สมาชิก</th>
            <th>วันที่อัปเดท</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${state.groups
            .map((group) => {
              const memberCount = state.members.filter((member) => member.group_id === group.id).length;
              return `
                <tr>
                  <td><strong>${escapeHtml(group.group_name)}</strong></td>
                  <td>${group.owner_account_email ? escapeHtml(group.owner_account_email) : `<span class="muted">-</span>`}</td>
                  <td>
                    ${group.owner_account_password
                      ? `<span class="badge success">บันทึกแล้ว</span> <button class="ghost-button" type="button" data-action="copy-owner-password" data-id="${attr(group.id)}">คัดลอก</button>`
                      : `<span class="muted">-</span>`}
                  </td>
                  <td>${renderStatusBadge(group.status)}</td>
                  <td>${memberCount}</td>
                  <td>${formatDate(group.data_updated_date)}</td>
                  <td class="actions">
                    <button class="ghost-button" type="button" data-action="edit-group" data-id="${attr(group.id)}">แก้ไข</button>
                    <button class="danger-button" type="button" data-action="delete-group" data-id="${attr(group.id)}">ลบ</button>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMembersAdmin() {
  const record = getEditingRecord("member", state.members);

  const sortedMembers = [...state.members].sort((a, b) => {
    const groupCompare = String(a.group_id).localeCompare(String(b.group_id));
    if (groupCompare !== 0) return groupCompare;
    return String(a.member_name).localeCompare(String(b.member_name), 'th');
  });

  return `
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>${record ? "แก้ไขสมาชิก" : "เพิ่มสมาชิก"}</h2>
          <p>อีเมลหลักของกลุ่มอยู่ที่หัวบ้าน ส่วนสมาชิกใช้เก็บอีเมลสำรองได้ตามต้องการ</p>
        </div>
      </div>
      <form class="form-grid" data-form="member">
        <label class="field">
          <span>กลุ่ม</span>
          <select name="group_id" required>
            <option value="">เลือกกลุ่ม</option>
            ${state.groups.map((group) => option(group.id, group.group_name, record?.group_id)).join("")}
          </select>
        </label>
        <label class="field">
          <span>ชื่อสมาชิก</span>
          <input name="member_name" value="${attr(record?.member_name)}" required />
        </label>
        <label class="field">
          <span>รหัสเข้าดู</span>
          <input name="access_code" value="${attr(record?.access_code)}" placeholder="FKP-A7K29" required />
        </label>
        <label class="field">
          <span>ประเภทอีเมล</span>
          <select name="email_type">
            ${option("store", "อีเมลร้าน", record?.email_type)}
            ${option("customer", "อีเมลลูกค้า", record?.email_type)}
          </select>
        </label>
        <label class="field full">
          <span>วันเดือนปีเกิด</span>
          <input
            name="birthday_due"
            type="date"
            value="${record?.birthday_due || ""}"
          />
        <label class="field full">
          <span>Email</span>
          <input name="backup_email" type="email" value="${attr(record?.backup_email || record?.email)}" placeholder="backup@example.com" />
          <small class="field-hint">ไม่บังคับกรอก ใช้เก็บอีเมลสำรองของสมาชิก</small>
        </label>
        <label class="field full">
          <span>วันที่ต้องชำระ</span>
          <input
            name="payment_due_date"
            type="date"
            value="${record?.payment_due_date || ""}"
          />
          <small class="field-hint">เลือกวันที่จากปฏิทิน หรือพิมพ์ในรูปแบบ วัน/เดือน/ปี</small>
        </label>
        <div class="toolbar full">
          <button class="primary-button" type="submit">${record ? "บันทึกการแก้ไข" : "เพิ่มสมาชิก"}</button>
          ${record ? `<button class="ghost-button" type="button" data-action="cancel-edit">ยกเลิก</button>` : ""}
        </div>
      </form>
      ${renderMembersTable(sortedMembers)}
    </section>
  `;
}

function renderMembersTable(members, options = {}) {
  if (!members.length) {
    return `<div class="empty-state"><p>ยังไม่มีสมาชิก</p></div>`;
  }

  const pageSize = options.compact ? members.length : 10;
  const totalPages = Math.ceil(members.length / pageSize);
  const currentPage = options.compact ? 1 : Math.max(1, Math.min(state.memberPage, totalPages));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedMembers = members.slice(startIndex, endIndex);

  let html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ชื่อสมาชิก</th>
            ${options.compact ? "" : "<th>รหัสเข้าดู</th>"}
            <th>กลุ่ม</th>
            <th>วันเกิด</th>
            ${options.compact ? "" : "<th>Email</th>"}
            <th>ประเภทอีเมล</th>
            <th>${options.showDueStatus ? "วันที่ต้องชำระ/สถานะ" : "วันที่ต้องชำระ"}</th>
            <th>วันที่อัปเดท</th>
            ${options.paymentAction ? "<th>ชำระเงิน</th>" : ""}
            ${options.compact ? "" : "<th>จัดการ</th>"}
          </tr>
        </thead>
        <tbody>
          ${paginatedMembers
            .map((member) => {
              const dueInfo = options.showDueStatus ? getDueInfo(member.payment_due_date) : null;
              return `
                <tr>
                  <td><strong>${escapeHtml(member.member_name)}</strong></td>
                  ${options.compact ? "" : `<td><code>${escapeHtml(member.access_code || "-")}</code></td>`}
                  <td>${escapeHtml(getGroupName(member.group_id))}</td>
                  <td>${formatBirthday(member)}</td>
                  ${options.compact ? "" : `<td>${escapeHtml(member.backup_email || member.email || "-")}</td>`}
                  <td>${renderEmailTypeBadge(member.email_type)}</td>
                  <td>
                    <div class="due-table-cell">
                      <strong>${formatDate(member.payment_due_date)}</strong>
                      ${dueInfo ? renderDueBadge(dueInfo) : ""}
                    </div>
                  </td>
                  <td>${formatDate(member.data_updated_date)}</td>
                  ${
                    options.paymentAction
                      ? `<td>
                          <button class="primary-button payment-action-button" type="button" data-action="mark-member-paid" data-id="${attr(member.id)}">ชำระแล้ว</button>
                        </td>`
                      : ""
                  }
                  ${
                    options.compact
                      ? ""
                      : `<td class="actions">
                          <button class="ghost-button" type="button" data-action="edit-member" data-id="${attr(member.id)}">แก้ไข</button>
                          <button class="danger-button" type="button" data-action="delete-member" data-id="${attr(member.id)}">ลบ</button>
                        </td>`
                  }
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  if (!options.compact && totalPages > 1) {
    html += `
      <div class="pagination-controls">
        <button class="ghost-button" type="button" data-action="prev-member-page" ${currentPage === 1 ? "disabled" : ""}>← ก่อนหน้า</button>
        <div class="pagination-pages">
          ${Array.from({ length: totalPages }, (_, i) => i + 1)
            .map(
              (page) => `
                <button class="pagination-page ${page === currentPage ? "is-active" : ""}" type="button" data-action="goto-member-page" data-page="${page}">
                  ${page}
                </button>
              `
            )
            .join("")}
        </div>
        <button class="ghost-button" type="button" data-action="next-member-page" ${currentPage === totalPages ? "disabled" : ""}>ถัดไป →</button>
      </div>
    `;
  }

  return html;
}

function renderAnnouncementsAdmin() {
  const record = getEditingRecord("announcement", state.announcements);

  return `
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>${record ? "แก้ไขประกาศ/โปรโมชั่น" : "เพิ่มประกาศ/โปรโมชั่น"}</h2>
          <p>รายการที่เปิดใช้งานจะแสดงให้ลูกค้าทุกคนหลังกรอกรหัสสำเร็จ</p>
        </div>
      </div>
      <form class="form-grid" data-form="announcement">
        <label class="field">
          <span>ประเภท</span>
          <select name="content_type">
            ${option("announcement", "ประกาศ", record?.content_type)}
            ${option("promotion", "โปรโมชั่น/ราคา", record?.content_type)}
          </select>
        </label>
        <label class="field">
          <span>ลำดับแสดงผล</span>
          <input name="display_order" type="number" value="${attr(record?.display_order ?? 0)}" />
        </label>
        <label class="field full">
          <span>หัวข้อ</span>
          <input name="title" value="${attr(record?.title)}" required />
        </label>
        <label class="field full">
          <span>รายละเอียด</span>
          <textarea name="detail">${escapeHtml(record?.detail || "")}</textarea>
        </label>
        <label class="field">
          <span>อัปโหลดรูป</span>
          <input name="image_file" type="file" accept="image/*" />
        </label>
        <label class="field">
          <span>URL รูปภาพ</span>
          <input name="image_url" value="${attr(record?.image_url)}" />
        </label>
        <label class="check-row">
          <input name="is_active" type="checkbox" ${record?.is_active === false ? "" : "checked"} />
          <span>เปิดแสดงผล</span>
        </label>
        <div class="toolbar full">
          <button class="primary-button" type="submit">${record ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</button>
          ${record ? `<button class="ghost-button" type="button" data-action="cancel-edit">ยกเลิก</button>` : ""}
        </div>
      </form>
      ${renderAnnouncementsTable()}
    </section>
  `;
}

function renderAnnouncementsTable() {
  if (!state.announcements.length) {
    return `<div class="empty-state"><p>ยังไม่มีประกาศหรือโปรโมชั่น</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>รูป</th>
            <th>หัวข้อ</th>
            <th>ประเภท</th>
            <th>สถานะ</th>
            <th>วันที่อัปเดท</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${state.announcements
            .map(
              (item) => `
                <tr>
                  <td>${item.image_url ? `<img class="thumb" src="${attr(item.image_url)}" alt="" />` : "-"}</td>
                  <td>
                    <strong>${escapeHtml(item.title)}</strong>
                    <div class="muted">${escapeHtml(item.detail || "")}</div>
                  </td>
                  <td>${escapeHtml(contentTypeLabel(item.content_type))}</td>
                  <td>${item.is_active ? `<span class="badge success">เปิด</span>` : `<span class="badge danger">ปิด</span>`}</td>
                  <td>${formatDate(item.data_updated_date)}</td>
                  <td class="actions">
                    <button class="ghost-button" type="button" data-action="edit-announcement" data-id="${attr(item.id)}">แก้ไข</button>
                    <button class="danger-button" type="button" data-action="delete-announcement" data-id="${attr(item.id)}">ลบ</button>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPromoAdmin() {
  const settings = getSiteSettings();
  const record = getEditingRecord("servicePlan", state.servicePlans);

  return `
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>ตั้งค่าหน้าโปรโมต</h2>
          <p>หน้าแรกของเว็บจะแสดงข้อมูลนี้ให้ทุกคนเห็น</p>
        </div>
      </div>
      <form class="form-grid" data-form="site-settings">
        <label class="field full">
          <span>หัวข้อหน้าแรก</span>
          <input name="hero_title" value="${attr(settings.hero_title)}" required />
        </label>
        <label class="field full">
          <span>ข้อความรอง</span>
          <textarea name="hero_subtitle">${escapeHtml(settings.hero_subtitle || "")}</textarea>
        </label>
        <label class="field">
          <span>ลิงก์ LINE</span>
          <input name="line_url" value="${attr(settings.line_url)}" placeholder="https://line.me/..." />
        </label>
        <label class="field">
          <span>ข้อความปุ่ม LINE</span>
          <input name="line_label" value="${attr(settings.line_label)}" placeholder="ติดต่อ LINE" />
        </label>
        <label class="field">
          <span>ลิงก์ Facebook</span>
          <input name="facebook_url" value="${attr(settings.facebook_url)}" placeholder="https://facebook.com/..." />
        </label>
        <label class="field">
          <span>ข้อความปุ่ม Facebook</span>
          <input name="facebook_label" value="${attr(settings.facebook_label)}" placeholder="ติดต่อ Facebook" />
        </label>
        <div class="toolbar full">
          <button class="primary-button" type="submit">บันทึกหน้าโปรโมต</button>
        </div>
      </form>
    </section>

    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>${record ? "แก้ไขสินค้า/บริการ" : "เพิ่มสินค้า/บริการ"}</h2>
        </div>
      </div>
      <form class="form-grid" data-form="service-plan">
        <label class="field">
          <span>ชื่อสินค้า/บริการ</span>
          <input name="title" value="${attr(record?.title)}" required />
        </label>
        <label class="field">
          <span>ราคา/ค่าใช้จ่าย</span>
          <input name="price_label" value="${attr(record?.price_label)}" placeholder="เช่น 99 บาท/เดือน" />
        </label>
        <label class="field">
          <span>สถานะสินค้า</span>
          <select name="slot_status">
            ${option("available", "มีที่ว่าง", record?.slot_status)}
            ${option("full", "เต็ม", record?.slot_status)}
          </select>
        </label>
        <label class="field">
          <span>จำนวนที่ว่าง</span>
          <input name="available_slots" type="number" min="0" value="${attr(record?.available_slots)}" />
        </label>
        <label class="field">
          <span>จำนวนทั้งหมด</span>
          <input name="total_slots" type="number" min="0" value="${attr(record?.total_slots)}" />
        </label>
        <label class="field">
          <span>อัปโหลดรูปสินค้า</span>
          <input name="image_file" type="file" accept="image/*" />
        </label>
        <label class="field full">
          <span>URL รูปสินค้า</span>
          <input name="image_url" value="${attr(record?.image_url)}" />
        </label>
        <label class="field">
          <span>อัปโหลดไอคอน</span>
          <input name="icon_file" type="file" accept="image/*" />
        </label>
        <label class="field">
          <span>URL ไอคอน</span>
          <input name="icon_url" value="${attr(record?.icon_url)}" />
        </label>
        <label class="field full">
          <span>รายละเอียด</span>
          <textarea name="description">${escapeHtml(record?.description || "")}</textarea>
        </label>
        <label class="field full">
          <span>รายการย่อย</span>
          <textarea name="features" placeholder="ใส่บรรทัดละ 1 รายการ">${escapeHtml((record?.features || []).join("\n"))}</textarea>
        </label>
        <label class="field">
          <span>ลำดับแสดงผล</span>
          <input name="display_order" type="number" value="${attr(record?.display_order ?? 0)}" />
        </label>
        <label class="check-row">
          <input name="is_active" type="checkbox" ${record?.is_active === false ? "" : "checked"} />
          <span>เปิดแสดงผล</span>
        </label>
        <div class="toolbar full">
          <button class="primary-button" type="submit">${record ? "บันทึกการแก้ไข" : "เพิ่มสินค้า/บริการ"}</button>
          ${record ? `<button class="ghost-button" type="button" data-action="cancel-edit">ยกเลิก</button>` : ""}
        </div>
      </form>
      ${renderServicePlanTable()}
    </section>
  `;
}

function renderServicePlanTable() {
  if (!state.servicePlans.length) {
    return `<div class="empty-state"><p>ยังไม่มีบริการหรือราคา</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>สินค้า/บริการ</th>
            <th>ราคา</th>
            <th>ว่าง/เต็ม</th>
            <th>สถานะ</th>
            <th>ลำดับ</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${state.servicePlans
            .map(
              (plan) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(plan.title)}</strong>
                    <div class="muted">${escapeHtml(plan.description || "")}</div>
                  </td>
                  <td>${escapeHtml(plan.price_label || "-")}</td>
                  <td>${renderPlanAvailabilityBadge(getPlanAvailability(plan))}</td>
                  <td>${plan.is_active ? `<span class="badge success">เปิด</span>` : `<span class="badge danger">ปิด</span>`}</td>
                  <td>${plan.display_order ?? 0}</td>
                  <td class="actions">
                    <button class="ghost-button" type="button" data-action="edit-service-plan" data-id="${attr(plan.id)}">แก้ไข</button>
                    <button class="danger-button" type="button" data-action="delete-service-plan" data-id="${attr(plan.id)}">ลบ</button>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}


function renderCustomer() {
  if (!state.portal) {
    app.innerHTML = `
      <section class="customer-login">
        <div class="customer-login-card">
          <div class="customer-login-copy">
            <span class="eyebrow">FKP Member</span>
            <h1>ตรวจสอบข้อมูลกลุ่ม</h1>
            <p>ข้อมูลกลุ่มและวันชำระล่าสุด</p>
          </div>
          <form class="form-grid" data-form="customer-code">
            <label class="field full">
              <span>รหัสลูกค้า</span>
              <input name="access_code" autocomplete="one-time-code" required />
              <small class="field-hint">รหัสนี้ได้รับจากร้านเท่านั้น</small>
            </label>
            <div class="toolbar full">
              <button class="primary-button" type="submit">ดูข้อมูล</button>
            </div>
          </form>
          <div class="customer-login-note">
            <strong>สำหรับลูกค้าของร้าน</strong>
            <span>ข้อมูลจะแสดงตามรหัสที่ได้รับเท่านั้น</span>
          </div>
        </div>
      </section>
    `;
    return;
  }

  const groups = state.portal.groups || [];
  const selectedGroup = groups.find((group) => group.id === state.selectedGroupId) || null;

  app.innerHTML = `
    <div class="customer-page-header">
      <div>
        <span class="eyebrow">ข้อมูลของคุณ</span>
        <h1>สวัสดี ${escapeHtml(state.portal.customer.display_name)}</h1>
        <p>${selectedGroup ? "รายละเอียดข้อมูลของคุณในกลุ่มนี้" : "กดการ์ดกลุ่มหรือไอคอนตาเพื่อดูข้อมูลของคุณ"}</p>
      </div>
      <div class="toolbar">
        ${selectedGroup ? `<button class="ghost-button" type="button" data-action="back-groups">กลับไปหน้ากลุ่ม</button>` : ""}
        <button class="ghost-button" type="button" data-action="refresh-customer">รีเฟรชข้อมูล</button>
        <button class="danger-button" type="button" data-action="clear-customer">ออกจากหน้านี้</button>
      </div>
    </div>

    ${
      selectedGroup
        ? renderCustomerGroupDetail(selectedGroup)
        : renderCustomerGroupCards(groups)
    }
  `;
}

function renderCustomerSummary(summary) {
  return `
    <section class="customer-summary">
      <div class="summary-card">
        <span>กลุ่มที่เข้าถึงได้</span>
        <strong>${summary.groupCount}</strong>
      </div>
      <div class="summary-card">
        <span>รายการของคุณ</span>
        <strong>${summary.customerMemberCount || "-"}</strong>
      </div>
      <div class="summary-card wide">
        <span>วันชำระของคุณ</span>
        <strong>${summary.nextDue ? formatDate(summary.nextDue.date) : "-"}</strong>
        ${summary.nextDue ? renderDueBadge(summary.nextDue) : `<span class="badge">ยังไม่มีวันชำระของคุณ</span>`}
      </div>
    </section>
  `;
}

function renderCustomerAnnouncements(items) {
  if (!items.length) return "";

  return `
    <section class="customer-section">
      <div class="section-header">
        <div>
          <h2>ประกาศและโปรโมชั่น</h2>
        </div>
      </div>
      <div class="announcement-strip">
        ${items
          .map(
            (item) => `
              <article class="announcement-item">
                ${renderAnnouncementImage(item)}
                <div class="announcement-body">
                  <span class="badge">${escapeHtml(contentTypeLabel(item.content_type))}</span>
                  <h3>${escapeHtml(item.title)}</h3>
                  ${item.detail ? `<p class="muted">${escapeHtml(item.detail)}</p>` : ""}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}


function renderCustomerGroupCards(groups) {
  if (!groups.length) {
    return `<section class="empty-state"><h1>ยังไม่มีกลุ่มที่ผูกกับรหัสนี้</h1></section>`;
  }

  return `
    <section class="customer-section">
      <div class="section-header">
        <div>
          <h2>กลุ่มของคุณ</h2>
          <p>กดที่การ์ด หรือปุ่มรูปตา เพื่อดูเฉพาะข้อมูลของคุณ</p>
        </div>
      </div>
      <div class="group-grid customer-group-grid">
        ${groups
          .map((group) => {
            const customerDue = getCustomerGroupDueSummary(group);
            const customerMembers = getCustomerMembersForGroup(group);
            const customerCountLabel = customerMembers.length
              ? `${customerMembers.length} รายการของคุณ`
              : "ยังไม่พบข้อมูลของคุณ";
            return `
              <button
                class="group-card customer-clickable-card"
                type="button"
                data-action="select-customer-group"
                data-id="${attr(group.id)}"
                aria-label="ดูข้อมูลของคุณในกลุ่ม ${attr(group.group_name)}"
              >
                <span class="group-card-top">
                  ${renderStatusBadge(group.status)}
                  <span class="group-card-view-hint">
                    <span class="eye-icon" aria-hidden="true">👁️</span>
                    <span>คลิกเพื่อดูข้อมูลของคุณ</span>
                  </span>
                </span>
                <span class="group-card-main">
                  <h3>${escapeHtml(group.group_name)}</h3>
                  <span class="muted">${escapeHtml(customerCountLabel)} · อัปเดท ${formatDate(group.data_updated_date)}</span>
                </span>
                <span class="group-card-footer customer-due-footer">
                  <span>
                    <span class="muted">วันชำระของคุณ</span>
                    <strong>${customerDue ? formatDate(customerDue.date) : "-"}</strong>
                  </span>
                  ${customerDue ? renderDueBadge(customerDue) : `<span class="badge">ยังไม่มีวันชำระของคุณ</span>`}
                </span>
                <span class="group-card-cta">
                  <span class="eye-icon" aria-hidden="true">👁️</span>
                  <span>ดูข้อมูลของฉัน</span>
                </span>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderCustomerGroupDetail(group) {
  const customerMembers = getCustomerMembersForGroup(group);

  return `
    <section class="customer-section customer-private-detail">
      <div class="group-detail-head customer-private-head">
        <div>
          <span class="eyebrow">Private Detail</span>
          <h2>${escapeHtml(group.group_name)}</h2>
          <p>หน้านี้แสดงเฉพาะข้อมูลของรหัสลูกค้าที่เข้าสู่ระบบอยู่เท่านั้น</p>
        </div>
        ${renderStatusBadge(group.status)}
      </div>

      ${
        customerMembers.length
          ? `<div class="customer-private-card-grid">
              ${customerMembers
                .map((member) => renderCustomerPrivateMemberCard(member, group))
                .join("")}
            </div>`
          : `<div class="customer-own-payment-panel is-empty">
              <div>
                <span class="eyebrow">Payment</span>
                <h3>ยังไม่พบข้อมูลของคุณในกลุ่มนี้</h3>
                <p>ถ้าข้อมูลไม่ตรง ลองกดรีเฟรช หรือติดต่อร้านเพื่อตรวจสอบรหัสลูกค้า</p>
              </div>
            </div>`
      }
    </section>
  `;
}

function renderCustomerPrivateMemberCard(member, group) {
  const due = getDueInfo(member.payment_due_date);

  return `
    <article class="customer-private-member-card">
      <div class="customer-private-card-head">
        <div>
          <span class="muted">ชื่อสมาชิก / ชื่อเฟส</span>
          <h3>${escapeHtml(member.member_name)}</h3>
        </div>
        <span class="badge success">ข้อมูลของคุณ</span>
      </div>

      <div class="customer-private-payment-box">
        <span>วันที่ต้องชำระ</span>
        <strong>${formatDate(member.payment_due_date)}</strong>
        ${due ? renderDueBadge(due) : `<span class="badge">ยังไม่มีวันชำระ</span>`}
      </div>

      <div class="member-meta-grid customer-private-meta-grid">
        <div>
          <span>กลุ่ม</span>
          <strong>${escapeHtml(group.group_name)}</strong>
        </div>
        <div>
          <span>วันเกิด</span>
          <strong>${formatBirthday(member)}</strong>
        </div>
        <div>
          <span>ประเภทอีเมล</span>
          <strong>${emailTypeLabel(member.email_type)}</strong>
        </div>
        <div>
          <span>อัปเดทล่าสุด</span>
          <strong>${formatDate(member.data_updated_date)}</strong>
        </div>
      </div>

      <div class="privacy-note">
        <span aria-hidden="true">🔒</span>
        <span>ระบบซ่อนข้อมูลสมาชิกคนอื่นในกลุ่มนี้ แสดงเฉพาะข้อมูลของคุณเท่านั้น</span>
      </div>
    </article>
  `;
}

async function loadAdminData() {
  const [groups, members, announcements, servicePlans, siteSettings] = await Promise.all([
    supabase.from("groups").select("*").order("group_name", { ascending: true }),
    supabase.from("members").select("*").order("member_name", { ascending: true }),
    supabase
      .from("announcements")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("service_plans")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle()
  ]);

  [groups, members, announcements, servicePlans, siteSettings].forEach((result) => {
    if (result.error) throw result.error;
  });

  state.groups = groups.data || [];
  state.members = members.data || [];
  state.announcements = announcements.data || [];
  state.servicePlans = servicePlans.data || [];
  state.siteSettings = siteSettings.data || getDefaultSiteSettings();
}

async function loadHomeData() {
  const { data, error } = await supabase.rpc("get_public_home");
  if (error) throw error;

  state.siteSettings = data?.settings || getDefaultSiteSettings();
  state.servicePlans = data?.service_plans || [];
  state.announcements = data?.announcements || [];
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;

  event.preventDefault();
  const formType = form.dataset.form;

  try {
    if (formType === "admin-login") await loginAdmin(form);
    if (formType === "customer-code") await openCustomerPortal(form);
    if (formType === "group") await saveGroup(form);
    if (formType === "member") await saveMember(form);
    if (formType === "announcement") await saveAnnouncement(form);
    if (formType === "site-settings") await saveSiteSettings(form);
    if (formType === "service-plan") await saveServicePlan(form);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleClick(event) {
  const lightboxBackdrop = event.target.closest("[data-lightbox-backdrop]");
  if (lightboxBackdrop && event.target === lightboxBackdrop) {
    closeImageLightbox();
    return;
  }

  const nav = event.target.closest("[data-nav]");
  if (nav) {
    navigate(nav.dataset.nav);
    return;
  }

  const tab = event.target.closest("[data-tab]");
  if (tab) {
    state.adminTab = tab.dataset.tab;
    state.editing = null;
    await render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const { action, id } = actionButton.dataset;

  try {
    if (action === "open-image") {
      openImageLightbox(actionButton.dataset.src, actionButton.dataset.title || "รูปภาพ");
      return;
    }

    if (action === "close-image") {
      closeImageLightbox();
      return;
    }

    if (action === "logout") {
      await supabase.auth.signOut();
      state.adminLoaded = false;
      await render();
      return;
    }

    if (action === "refresh-admin") {
      state.adminLoaded = false;
      await render();
      return;
    }

    if (action === "cancel-edit") {
      state.editing = null;
      await render();
      return;
    }

    if (action === "edit-group") editRecord("groups", "group", id, "groups");
    if (action === "edit-member") editRecord("members", "member", id, "members");
    if (action === "edit-announcement") {
      editRecord("announcements", "announcement", id, "announcements");
    }
    if (action === "edit-service-plan") {
      editRecord("servicePlans", "servicePlan", id, "promo");
    }

    if (action === "delete-group") await deleteRecord("groups", id, "ลบกลุ่มนี้หรือไม่");
    if (action === "delete-member") await deleteRecord("members", id, "ลบสมาชิกนี้หรือไม่");
    if (action === "delete-announcement") {
      await deleteRecord("announcements", id, "ลบประกาศ/โปรโมชั่นนี้หรือไม่");
    }
    if (action === "delete-service-plan") {
      await deleteRecord("service_plans", id, "ลบบริการ/ราคานี้หรือไม่");
    }

    if (action === "mark-member-paid") {
      await markMemberPaid(id);
      return;
    }

    if (action === "copy-owner-password") {
      const grp = state.groups.find((g) => String(g.id) === String(id));
      if (!grp || !grp.owner_account_password) {
        showToast("ไม่พบ Password สำหรับกลุ่มนี้", true);
        return;
      }
      const text = String(grp.owner_account_password);
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast("คัดลอก Password แล้ว");
      return;
    }

    if (action === "select-customer-group") {
      state.selectedGroupId = id;
      renderCustomer();
      return;
    }

    if (action === "back-groups") {
      state.selectedGroupId = null;
      renderCustomer();
      return;
    }

    if (action === "clear-customer") {
      state.portal = null;
      state.portalAccessCode = null;
      state.selectedGroupId = null;
      renderCustomer();
      return;
    }

    if (action === "refresh-customer") {
      await refreshCustomerPortal();
      return;
    }

    if (action === "next-member-page") {
      state.memberPage += 1;
      await render();
      return;
    }

    if (action === "prev-member-page") {
      state.memberPage = Math.max(1, state.memberPage - 1);
      await render();
      return;
    }

    if (action === "goto-member-page") {
      state.memberPage = Number(actionButton.dataset.page) || 1;
      await render();
      return;
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeImageLightbox();
  }
}

async function loginAdmin(form) {
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.session = data.session;
  state.adminLoaded = false;
  showToast("เข้าสู่ระบบแล้ว");
  await render();
}

async function openCustomerPortal(form) {
  const formData = new FormData(form);
  const accessCode = String(formData.get("access_code") || "").trim();
  if (!accessCode) throw new Error("กรุณากรอกรหัสลูกค้า");

  const { data, error } = await supabase.rpc("get_customer_portal", {
    p_access_code: accessCode
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || "ไม่พบข้อมูลของรหัสนี้");

  state.portal = data;
  state.portalAccessCode = accessCode;
  state.selectedGroupId = null;
  renderCustomer();
}

async function refreshCustomerPortal() {
  if (!state.portalAccessCode) {
    throw new Error("ไม่พบรหัสสำหรับรีเฟรชข้อมูล");
  }

  const { data, error } = await supabase.rpc("get_customer_portal", {
    p_access_code: state.portalAccessCode
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || "ไม่พบข้อมูลของรหัสนี้");

  state.portal = data;
  if (state.selectedGroupId && !data.groups?.some((group) => group.id === state.selectedGroupId)) {
    state.selectedGroupId = null;
  }
  showToast("รีเฟรชข้อมูลแล้ว");
  renderCustomer();
}

async function saveGroup(form) {
  const formData = new FormData(form);
  const record = getEditingRecord("group", state.groups);
  const ownerPassword = clean(formData.get("owner_account_password"));
  const clearOwnerPassword = formData.get("clear_owner_account_password") === "on";
  const payload = {
    group_name: clean(formData.get("group_name")),
    owner_account_email: clean(formData.get("owner_account_email")) || null,
    status: clean(formData.get("status")) || "active",
    data_updated_date: todayInput()
  };

  if (clearOwnerPassword) {
    payload.owner_account_password = null;
  } else if (ownerPassword) {
    payload.owner_account_password = ownerPassword;
  } else if (!record) {
    payload.owner_account_password = null;
  }

  if (record) {
    await checked(supabase.from("groups").update(payload).eq("id", record.id));
  } else {
    await checked(supabase.from("groups").insert(payload));
  }

  await reloadAfterSave("บันทึกกลุ่มแล้ว");
}

async function saveMember(form) {
  const formData = new FormData(form);
  const record = getEditingRecord("member", state.members);
  const payload = {
    group_id: clean(formData.get("group_id")),
    member_name: clean(formData.get("member_name")),
    access_code: clean(formData.get("access_code")),
    birthday_due: parsePaymentDueDate(formData.get("birthday_due"), "วันเดือนปีเกิด"),
    backup_email: clean(formData.get("backup_email")) || null,
    email_type: clean(formData.get("email_type")) || "store",
    payment_due_date: parsePaymentDueDate(formData.get("payment_due_date"), "วันที่ต้องชำระ"),
    data_updated_date: todayInput()
  };

  if (!payload.access_code) {
    throw new Error("กรุณาใส่รหัสเข้าดูของสมาชิก");
  }


  if (record) {
    await checked(supabase.from("members").update(payload).eq("id", record.id));
  } else {
    await checked(supabase.from("members").insert(payload));
  }

  await reloadAfterSave("บันทึกสมาชิกแล้ว");
}

async function saveAnnouncement(form) {
  const formData = new FormData(form);
  const record = getEditingRecord("announcement", state.announcements);
  const file = form.querySelector('input[name="image_file"]').files[0];
  let imageUrl = clean(formData.get("image_url")) || null;

  if (file) {
    imageUrl = await uploadAsset(file);
  }

  const payload = {
    content_type: clean(formData.get("content_type")) || "announcement",
    title: clean(formData.get("title")),
    detail: clean(formData.get("detail")) || null,
    image_url: imageUrl,
    is_active: formData.get("is_active") === "on",
    display_order: numberOrNull(formData.get("display_order")) || 0,
    data_updated_date: todayInput()
  };

  if (record) {
    await checked(supabase.from("announcements").update(payload).eq("id", record.id));
  } else {
    await checked(supabase.from("announcements").insert(payload));
  }

  await reloadAfterSave("บันทึกประกาศ/โปรโมชั่นแล้ว");
}

async function saveSiteSettings(form) {
  const formData = new FormData(form);
  const payload = {
    id: 1,
    hero_title: clean(formData.get("hero_title")),
    hero_subtitle: clean(formData.get("hero_subtitle")) || null,
    line_url: clean(formData.get("line_url")) || null,
    line_label: clean(formData.get("line_label")) || "ติดต่อ LINE",
    facebook_url: clean(formData.get("facebook_url")) || null,
    facebook_label: clean(formData.get("facebook_label")) || "ติดต่อ Facebook"
  };

  await checked(supabase.from("site_settings").upsert(payload, { onConflict: "id" }));
  state.homeLoaded = false;
  await reloadAfterSave("บันทึกหน้าโปรโมตแล้ว");
}

async function saveServicePlan(form) {
  const formData = new FormData(form);
  const record = getEditingRecord("servicePlan", state.servicePlans);
  const imageFile = form.querySelector('input[name="image_file"]').files[0];
  const iconFile = form.querySelector('input[name="icon_file"]').files[0];
  let imageUrl = clean(formData.get("image_url")) || null;
  let iconUrl = clean(formData.get("icon_url")) || null;

  if (imageFile) {
    imageUrl = await uploadAsset(imageFile);
  }

  if (iconFile) {
    iconUrl = await uploadAsset(iconFile);
  }

  const payload = {
    title: clean(formData.get("title")),
    description: clean(formData.get("description")) || null,
    price_label: clean(formData.get("price_label")) || null,
    image_url: imageUrl,
    icon_url: iconUrl,
    slot_status: clean(formData.get("slot_status")) || "available",
    available_slots: numberOrNull(formData.get("available_slots")),
    total_slots: numberOrNull(formData.get("total_slots")),
    features: String(formData.get("features") || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    display_order: numberOrNull(formData.get("display_order")) || 0,
    is_active: formData.get("is_active") === "on"
  };

  if (record) {
    await checked(supabase.from("service_plans").update(payload).eq("id", record.id));
  } else {
    await checked(supabase.from("service_plans").insert(payload));
  }

  state.homeLoaded = false;
  await reloadAfterSave("บันทึกบริการ/ราคาแล้ว");
}

async function uploadAsset(file) {
  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);
  const path = `uploads/${Date.now()}-${safeName || "image"}`;
  const { error } = await supabase.storage.from("public-assets").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });
  if (error) {
    if (String(error.message || "").toLowerCase().includes("bucket")) {
      throw new Error("ไม่พบ bucket public-assets ให้สร้างใน Supabase Storage หรือรัน supabase/storage.sql");
    }
    throw error;
  }

  const { data } = supabase.storage.from("public-assets").getPublicUrl(path);
  return data.publicUrl;
}

function editRecord(collectionName, type, id, tab) {
  const found = state[collectionName].some((item) => item.id === id);
  if (!found) throw new Error("ไม่พบข้อมูลที่ต้องการแก้ไข");
  state.editing = { type, id };
  state.adminTab = tab;
  void render();
}

async function deleteRecord(tableName, id, message) {
  if (!window.confirm(message)) return;
  await checked(supabase.from(tableName).delete().eq("id", id));
  if (tableName === "service_plans" || tableName === "announcements") {
    state.homeLoaded = false;
  }
  await reloadAfterSave("ลบข้อมูลแล้ว");
}

async function markMemberPaid(memberId) {
  const member = state.members.find((item) => String(item.id) === String(memberId));
  if (!member) throw new Error("ไม่พบสมาชิก");
  if (!member.payment_due_date) throw new Error("สมาชิกนี้ยังไม่มีวันที่ต้องชำระ");

  const nextDueDate = addMonthsToDateInput(member.payment_due_date, 1);
  const confirmed = window.confirm(
    `ยืนยันว่ารับชำระของ ${member.member_name} แล้ว และเลื่อนวันชำระเป็น ${formatDate(nextDueDate)} หรือไม่`
  );
  if (!confirmed) return;

  await checked(
    supabase
      .from("members")
      .update({
        payment_due_date: nextDueDate,
        data_updated_date: todayInput()
      })
      .eq("id", member.id)
  );

  await reloadAfterSave(`อัปเดทวันชำระถัดไปเป็น ${formatDate(nextDueDate)}`);
}

async function reloadAfterSave(message) {
  state.editing = null;
  state.adminLoaded = false;
  showToast(message);
  await render();
}

async function checked(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result;
}

function getEditingRecord(type, collection) {
  if (state.editing?.type !== type) return null;
  return collection.find((item) => item.id === state.editing.id) || null;
}

function getGroupName(groupId) {
  return state.groups.find((group) => group.id === groupId)?.group_name || "-";
}

function getDueSoonMembers() {
  const today = parseDateInput(todayInput());
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 7);

  return state.members
    .filter((member) => {
      const due = parseDateInput(member.payment_due_date);
      if (!due) return false;
      return due >= today && due <= limit;
    })
    .sort((a, b) => String(a.payment_due_date).localeCompare(String(b.payment_due_date)));
}

function getOutstandingMembers() {
  const today = parseDateInput(todayInput());
  return state.members
    .filter((member) => {
      const due = parseDateInput(member.payment_due_date);
      return due && due <= today;
    })
    .sort((a, b) => String(a.payment_due_date).localeCompare(String(b.payment_due_date)));
}

function getPaymentWatchMembers() {
  const byId = new Map();
  [...getOutstandingMembers(), ...getDueSoonMembers()].forEach((member) => {
    byId.set(member.id, member);
  });
  return [...byId.values()].sort((a, b) => String(a.payment_due_date).localeCompare(String(b.payment_due_date)));
}

function getDefaultSiteSettings() {
  return {
    id: 1,
    hero_title: "FKP Shop",
    hero_subtitle: "บริการพรีเมียม ราคาชัดเจน พร้อมช่องทางติดต่อร้าน",
    line_url: "",
    line_label: "ติดต่อ LINE",
    facebook_url: "",
    facebook_label: "ติดต่อ Facebook"
  };
}

function getSiteSettings() {
  return { ...getDefaultSiteSettings(), ...(state.siteSettings || {}) };
}

function renderFeatureList(features) {
  const items = Array.isArray(features) ? features.filter(Boolean) : [];
  if (!items.length) return "";

  return `
    <ul class="feature-list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function renderFeatureTags(features) {
  const items = Array.isArray(features) ? features.filter(Boolean).slice(0, 3) : [];
  if (!items.length) return "";

  return `
    <div class="feature-tags">
      ${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function getPlanAvailability(plan) {
  const availableSlots =
    plan.available_slots === null || plan.available_slots === undefined || plan.available_slots === ""
      ? null
      : Number(plan.available_slots);
  const totalSlots =
    plan.total_slots === null || plan.total_slots === undefined || plan.total_slots === ""
      ? null
      : Number(plan.total_slots);
  const normalizedAvailableSlots = Number.isFinite(availableSlots) ? availableSlots : null;
  const normalizedTotalSlots = Number.isFinite(totalSlots) ? totalSlots : null;
  const isFull = plan.slot_status === "full" || normalizedAvailableSlots === 0;

  if (isFull) {
    return {
      status: "full",
      badge: "เต็ม",
      label: normalizedTotalSlots ? `เต็ม ${normalizedTotalSlots}/${normalizedTotalSlots}` : "เต็ม"
    };
  }

  if (normalizedAvailableSlots !== null && normalizedTotalSlots !== null && normalizedTotalSlots > 0) {
    return {
      status: "available",
      badge: "มีที่ว่าง",
      label: `ว่าง ${normalizedAvailableSlots}/${normalizedTotalSlots}`
    };
  }

  if (normalizedAvailableSlots !== null) {
    return {
      status: "available",
      badge: "มีที่ว่าง",
      label: `ว่าง ${normalizedAvailableSlots}`
    };
  }

  return {
    status: "available",
    badge: "มีที่ว่าง",
    label: "มีที่ว่าง"
  };
}

function renderPlanAvailabilityBadge(availability) {
  const className = availability.status === "full" ? "danger" : "success";
  return `<span class="badge ${className}">${escapeHtml(availability.badge)}</span>`;
}


function renderCustomerOwnDuePanel(group) {
  const customerMembers = getCustomerMembersForGroup(group);

  if (!customerMembers.length) {
    return `
      <div class="customer-own-payment-panel is-empty">
        <div>
          <span class="eyebrow">Payment</span>
          <h3>ยังไม่พบวันชำระของคุณในกลุ่มนี้</h3>
          <p>ถ้าข้อมูลไม่ตรง ลองรีเฟรชข้อมูล หรือติดต่อร้านเพื่อตรวจสอบรหัสลูกค้า</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="customer-own-payment-panel">
      <div>
        <span class="eyebrow">Payment</span>
        <h3>ข้อมูลวันชำระของคุณ</h3>
        <p>ใช้วันชำระของสมาชิกที่ตรงกับรหัสลูกค้านี้ ไม่ใช้วันชำระรวมของทั้งกลุ่ม</p>
      </div>
      <div class="customer-own-payment-list">
        ${customerMembers
          .map((member) => {
            const due = getDueInfo(member.payment_due_date);
            return `
              <div class="customer-own-payment-item">
                <div>
                  <span class="muted">ชื่อสมาชิก</span>
                  <strong>${escapeHtml(member.member_name)}</strong>
                </div>
                <div>
                  <span class="muted">วันที่ต้องชำระ</span>
                  <strong>${formatDate(member.payment_due_date)}</strong>
                </div>
                <div>
                  <span class="muted">สถานะ</span>
                  ${due ? renderDueBadge(due) : `<span class="badge">ยังไม่มีวันชำระ</span>`}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function getCustomerPortalSummary(groups) {
  const customerMembers = getCustomerVisibleMembers(groups);
  const dueItems = customerMembers
    .map((member) => getDueInfo(member.payment_due_date))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    groupCount: groups.length,
    activeCount: groups.filter((group) => group.status === "active").length,
    customerMemberCount: customerMembers.length,
    nextDue: dueItems[0] || null
  };
}

function getCustomerVisibleMembers(groups) {
  return (groups || []).flatMap((group) => getCustomerMembersForGroup(group));
}

function getCustomerGroupDueSummary(group) {
  const dueItems = getCustomerMembersForGroup(group)
    .map((member) => getDueInfo(member.payment_due_date))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return dueItems[0] || null;
}

function getCustomerMembersForGroup(group) {
  const members = Array.isArray(group?.members) ? group.members : [];
  const matchedMembers = getCustomerMatchedMembers(members);

  if (matchedMembers.length) return matchedMembers;
  if (members.length === 1) return members;
  return [];
}

function getCustomerMatchedMembers(members) {
  const customer = state.portal?.customer || {};
  const portalAccessCode = normalizeAccessCode(state.portalAccessCode);
  const customerAccessCode = normalizeAccessCode(
    customer.access_code || customer.code || customer.customer_code || customer.portal_access_code
  );
  const possibleCustomerIds = [
    customer.member_id,
    customer.memberId,
    customer.customer_member_id,
    customer.id,
    customer.customer_id
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => String(value));
  const customerName = normalizeSearchText(
    customer.display_name || customer.member_name || customer.name || customer.facebook_name
  );

  return (members || []).filter((member) => {
    if (
      member.is_current_user === true ||
      member.is_current_customer === true ||
      member.is_current_member === true ||
      member.is_self === true
    ) {
      return true;
    }

    if (possibleCustomerIds.length && possibleCustomerIds.includes(String(member.id))) {
      return true;
    }

    const memberName = normalizeSearchText(member.member_name || member.display_name || member.facebook_name || member.name);
    if (customerName && memberName && memberName === customerName) {
      return true;
    }

    const memberAccessCode = normalizeAccessCode(member.access_code || member.customer_code || member.portal_access_code);
    if (portalAccessCode && memberAccessCode && memberAccessCode === portalAccessCode) {
      return true;
    }

    if (customerAccessCode && memberAccessCode && memberAccessCode === customerAccessCode) {
      return true;
    }

    return false;
  });
}


function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAccessCode(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase();
}

function getDueInfo(value) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  const due = parseDateInput(date);
  const today = parseDateInput(todayInput());
  if (!due || !today) return null;

  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  let status = "normal";
  let label = "รอชำระ";

  if (days < 0) {
    status = "overdue";
    label = "เลยกำหนด";
  } else if (days === 0) {
    status = "today";
    label = "ครบกำหนดวันนี้";
  } else if (days <= 7) {
    status = "soon";
    label = "ใกล้ถึงวันชำระ";
  }

  return { date, days, status, label };
}

function renderDueBadge(dueInfo) {
  return `
    <span class="badge due-${dueInfo.status} due-badge">
      <span>${escapeHtml(dueInfo.label)}</span>
      <strong>${escapeHtml(formatDueDistance(dueInfo.days))}</strong>
    </span>
  `;
}

function formatDueDistance(days) {
  if (days < 0) return `เลยมาแล้ว ${Math.abs(days)} วัน`;
  if (days === 0) return "วันนี้";
  return `อีก ${days} วัน`;
}

function renderStatusBadge(status) {
  if (status === "maintenance") return `<span class="badge warning">ปรับปรุง</span>`;
  return `<span class="badge success">ใช้งานได้</span>`;
}

function renderEmailTypeBadge(emailType) {
  const label = emailTypeLabel(emailType);
  const className = emailType === "customer" ? "warning" : "success";
  return `<span class="badge ${className}">${label}</span>`;
}

function emailTypeLabel(emailType) {
  return emailType === "customer" ? "อีเมลลูกค้า" : "อีเมลร้าน";
}

function contentTypeLabel(type) {
  return type === "promotion" ? "โปรโมชั่น/ราคา" : "ประกาศ";
}

function option(value, label, selectedValue) {
  return `<option value="${attr(value)}" ${String(value) === String(selectedValue || "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
}


function formatBirthday(item) {
  if (item?.birthday_due) return formatDate(item.birthday_due);

  const day = item?.birthday_day ? String(item.birthday_day).padStart(2, "0") : "";
  const month = item?.birthday_month ? String(item.birthday_month).padStart(2, "0") : "";
  const year = item?.birthday_year ? String(item.birthday_year) : "";

  if (day && month && year) return `${day}/${month}/${year}`;
  if (day && month) return `${day}/${month}`;
  return "-";
}

function formatDate(value) {
  if (!value) return "-";
  const date = String(value).slice(0, 10);
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

function formatDateInputDisplay(value) {
  if (!value) return "";
  const date = String(value).slice(0, 10);
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

function parsePaymentDueDate(value, fieldLabel = "วันที่ต้องชำระ") {
  const raw = clean(value);
  if (!raw) return null;

  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    return toIsoDate(isoDate[1], isoDate[2], isoDate[3], fieldLabel);
  }

  const thaiDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (thaiDate) {
    return toIsoDate(thaiDate[3], thaiDate[2], thaiDate[1], fieldLabel);
  }

  throw new Error(`${fieldLabel}ต้องเป็นรูปแบบ วัน/เดือน/ปี เช่น 16/05/2026 หรือเลือกจากปฏิทิน`);
}

function toIsoDate(year, month, day, fieldLabel = "วันที่ต้องชำระ") {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const parsed = new Date(y, m - 1, d);

  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    y < 1900 ||
    y > 2200 ||
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    throw new Error(`${fieldLabel}ไม่ถูกต้อง`);
  }

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateInput(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addMonthsToDateInput(value, months) {
  const date = parseDateInput(value);
  if (!date) throw new Error("วันที่ต้องชำระไม่ถูกต้อง");

  const originalDay = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(originalDay, lastDay));

  return toIsoDate(target.getFullYear(), target.getMonth() + 1, target.getDate());
}

function todayInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function numberOrNull(value) {
  const cleanValue = clean(value);
  if (!cleanValue) return null;
  const numberValue = Number(cleanValue);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

function openImageLightbox(src, title) {
  if (!src) return;
  closeImageLightbox();

  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.dataset.lightboxBackdrop = "";
  lightbox.innerHTML = `
    <div class="image-lightbox-dialog" role="dialog" aria-modal="true" aria-label="${attr(title)}">
      <div class="image-lightbox-head">
        <h2>${escapeHtml(title)}</h2>
        <button class="image-lightbox-close" type="button" data-action="close-image">ปิด</button>
      </div>
      <img src="${attr(src)}" alt="${attr(title)}" />
    </div>
  `;
  document.body.appendChild(lightbox);
  document.body.classList.add("has-lightbox");
}

function closeImageLightbox() {
  document.querySelector(".image-lightbox")?.remove();
  document.body.classList.remove("has-lightbox");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function attr(value) {
  return escapeHtml(value ?? "");
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle("is-error", isError);
  toastEl.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toastEl.classList.remove("is-visible");
  }, 3200);
}
