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
  selectedGroupId: null
};

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
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
    <div class="page-header">
      <div>
        <h1>ผู้จัดการระบบ</h1>
        <p>${escapeHtml(state.session?.user?.email || "")}</p>
      </div>
      <div class="toolbar">
        <button class="ghost-button" type="button" data-action="refresh-admin">โหลดใหม่</button>
        <button class="danger-button" type="button" data-action="logout">ออกจากระบบ</button>
      </div>
    </div>
    <div class="tabs">
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
  `;
}

function renderDashboard() {
  const activeGroups = state.groups.filter((group) => group.status === "active").length;
  const membersWithCode = state.members.filter((member) => member.access_code).length;
  const dueSoon = getDueSoonMembers();

  return `
    <section class="section-block">
      <div class="grid stats-grid">
        ${renderStat("กลุ่มทั้งหมด", state.groups.length)}
        ${renderStat("กลุ่มใช้งานได้", activeGroups)}
        ${renderStat("มีรหัสเข้าดู", membersWithCode)}
        ${renderStat("สมาชิกทั้งหมด", state.members.length)}
      </div>
    </section>

    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>ใกล้ถึงวันที่ต้องชำระ</h2>
          <p>แสดงรายการภายใน 7 วันจากวันนี้</p>
        </div>
      </div>
      ${
        dueSoon.length
          ? renderMembersTable(dueSoon, { compact: true })
          : `<div class="empty-state"><p>ยังไม่มีรายการที่ใกล้ถึงวันชำระ</p></div>`
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
        <span class="eyebrow">FKP Shop</span>
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
                ${item.image_url ? `<img src="${attr(item.image_url)}" alt="${attr(item.title)}" />` : ""}
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
                  <div class="plan-seller-row">
                    ${
                      plan.icon_url
                        ? `<img class="plan-icon" src="${attr(plan.icon_url)}" alt="" />`
                        : `<span class="plan-icon-text">${escapeHtml(plan.title.slice(0, 1).toUpperCase())}</span>`
                    }
                    <span>FKP Shop</span>
                  </div>
                  <h3>${escapeHtml(plan.title)}</h3>
                  ${plan.description ? `<p class="plan-description">${escapeHtml(plan.description)}</p>` : ""}
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
      <form class="form-grid" data-form="group">
        <label class="field">
          <span>ชื่อกลุ่ม</span>
          <input name="group_name" value="${attr(record?.group_name)}" required />
        </label>
        <label class="field">
          <span>สถานะ</span>
          <select name="status">
            ${option("active", "ใช้งานได้", record?.status)}
            ${option("maintenance", "ปรับปรุง", record?.status)}
          </select>
        </label>
        <label class="field">
          <span>วันที่อัปเดทข้อมูล</span>
          <input name="data_updated_date" type="date" value="${attr(record?.data_updated_date || todayInput())}" />
        </label>
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

  return `
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>${record ? "แก้ไขสมาชิก" : "เพิ่มสมาชิก"}</h2>
          <p>อีเมลจริงจะเห็นเฉพาะฝั่งแอดมิน ฝั่งลูกค้าเห็นแค่ประเภทอีเมล</p>
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
          <span>วันเกิด: วัน</span>
          <input name="birthday_day" type="number" min="1" max="31" value="${attr(record?.birthday_day)}" />
        </label>
        <label class="field">
          <span>วันเกิด: เดือน</span>
          <input name="birthday_month" type="number" min="1" max="12" value="${attr(record?.birthday_month)}" />
        </label>
        <label class="field">
          <span>วันเกิด: ปี</span>
          <input name="birthday_year" type="number" min="1900" max="2200" value="${attr(record?.birthday_year)}" />
        </label>
        <label class="field">
          <span>ประเภทอีเมล</span>
          <select name="email_type">
            ${option("store", "อีเมลร้าน", record?.email_type)}
            ${option("customer", "อีเมลลูกค้า", record?.email_type)}
          </select>
        </label>
        <label class="field">
          <span>อีเมลจริง</span>
          <input name="email" type="email" value="${attr(record?.email)}" required />
        </label>
        <label class="field">
          <span>วันที่ต้องชำระ</span>
          <input name="payment_due_date" type="date" value="${attr(record?.payment_due_date)}" />
        </label>
        <label class="field">
          <span>วันที่อัปเดทข้อมูล</span>
          <input name="data_updated_date" type="date" value="${attr(record?.data_updated_date || todayInput())}" />
        </label>
        <div class="toolbar full">
          <button class="primary-button" type="submit">${record ? "บันทึกการแก้ไข" : "เพิ่มสมาชิก"}</button>
          ${record ? `<button class="ghost-button" type="button" data-action="cancel-edit">ยกเลิก</button>` : ""}
        </div>
      </form>
      ${renderMembersTable(state.members)}
    </section>
  `;
}

function renderMembersTable(members, options = {}) {
  if (!members.length) {
    return `<div class="empty-state"><p>ยังไม่มีสมาชิก</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ชื่อสมาชิก</th>
            ${options.compact ? "" : "<th>รหัสเข้าดู</th>"}
            <th>กลุ่ม</th>
            <th>วันเกิด</th>
            ${options.compact ? "" : "<th>อีเมลจริง</th>"}
            <th>ประเภทอีเมล</th>
            <th>วันที่ต้องชำระ</th>
            <th>วันที่อัปเดท</th>
            ${options.compact ? "" : "<th>จัดการ</th>"}
          </tr>
        </thead>
        <tbody>
          ${members
            .map(
              (member) => `
                <tr>
                  <td><strong>${escapeHtml(member.member_name)}</strong></td>
                  ${options.compact ? "" : `<td><code>${escapeHtml(member.access_code || "-")}</code></td>`}
                  <td>${escapeHtml(getGroupName(member.group_id))}</td>
                  <td>${formatBirthday(member)}</td>
                  ${options.compact ? "" : `<td>${escapeHtml(member.email || "-")}</td>`}
                  <td>${renderEmailTypeBadge(member.email_type)}</td>
                  <td>${formatDate(member.payment_due_date)}</td>
                  <td>${formatDate(member.data_updated_date)}</td>
                  ${
                    options.compact
                      ? ""
                      : `<td class="actions">
                          <button class="ghost-button" type="button" data-action="edit-member" data-id="${attr(member.id)}">แก้ไข</button>
                          <button class="danger-button" type="button" data-action="delete-member" data-id="${attr(member.id)}">ลบ</button>
                        </td>`
                  }
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
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
        <label class="field">
          <span>วันที่อัปเดทข้อมูล</span>
          <input name="data_updated_date" type="date" value="${attr(record?.data_updated_date || todayInput())}" />
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
              <input name="access_code" autocomplete="one-time-code" placeholder="FKP-A7K29" required />
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
  const selectedGroup =
    groups.find((group) => group.id === state.selectedGroupId) || null;
  const summary = getCustomerPortalSummary(groups);

  app.innerHTML = `
    <div class="customer-page-header">
      <div>
        <span class="eyebrow">ข้อมูลของคุณ</span>
        <h1>สวัสดี ${escapeHtml(state.portal.customer.display_name)}</h1>
        <p>${selectedGroup ? "รายละเอียดกลุ่มที่เลือก" : "กลุ่มที่คุณสามารถดูได้"}</p>
      </div>
      <div class="toolbar">
        ${selectedGroup ? `<button class="ghost-button" type="button" data-action="back-groups">กลับไปหน้ากลุ่ม</button>` : ""}
        <button class="ghost-button" type="button" data-action="refresh-customer">รีเฟรชข้อมูล</button>
        <button class="danger-button" type="button" data-action="clear-customer">ออกจากหน้านี้</button>
      </div>
    </div>

    ${selectedGroup ? "" : renderCustomerSummary(summary)}
    ${renderCustomerAnnouncements(state.portal.announcements || [])}

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
        <span>กลุ่มทั้งหมด</span>
        <strong>${summary.groupCount}</strong>
      </div>
      <div class="summary-card">
        <span>ใช้งานได้</span>
        <strong>${summary.activeCount}</strong>
      </div>
      <div class="summary-card wide">
        <span>วันชำระถัดไป</span>
        <strong>${summary.nextDue ? formatDate(summary.nextDue.date) : "-"}</strong>
        ${summary.nextDue ? renderDueBadge(summary.nextDue) : `<span class="badge">ยังไม่มีวันชำระ</span>`}
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
                ${item.image_url ? `<img src="${attr(item.image_url)}" alt="${attr(item.title)}" />` : ""}
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
        </div>
      </div>
      <div class="group-grid">
        ${groups
          .map((group) => {
            const due = getGroupDueSummary(group);
            const memberCount = group.members?.length || 0;
            return `
              <button class="group-card" type="button" data-action="select-customer-group" data-id="${attr(group.id)}">
                <span class="group-card-top">
                  ${renderStatusBadge(group.status)}
                  <span class="muted">${memberCount} สมาชิก</span>
                </span>
                <span>
                  <h3>${escapeHtml(group.group_name)}</h3>
                  <span class="muted">อัปเดท ${formatDate(group.data_updated_date)}</span>
                </span>
                <span class="group-card-footer">
                  <span>
                    <span class="muted">วันชำระถัดไป</span>
                    <strong>${due ? formatDate(due.date) : "-"}</strong>
                  </span>
                  ${due ? renderDueBadge(due) : `<span class="badge">ยังไม่มีวันชำระ</span>`}
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
  const due = getGroupDueSummary(group);

  return `
    <section class="customer-section">
      <div class="group-detail-head">
        <div>
          <h2>${escapeHtml(group.group_name)}</h2>
          <p>อัปเดท ${formatDate(group.data_updated_date)}</p>
        </div>
        ${renderStatusBadge(group.status)}
      </div>
      <div class="detail-summary-grid">
        <div>
          <span>สมาชิก</span>
          <strong>${group.members?.length || 0}</strong>
        </div>
        <div>
          <span>วันชำระถัดไป</span>
          <strong>${due ? formatDate(due.date) : "-"}</strong>
        </div>
        <div>
          <span>สถานะวันชำระ</span>
          ${due ? renderDueBadge(due) : `<span class="badge">ยังไม่มีวันชำระ</span>`}
        </div>
      </div>
      ${
        group.members?.length
          ? `<div class="member-card-grid">
              ${group.members
                .map((member) => {
                  const memberDue = getDueInfo(member.payment_due_date);
                  return `
                    <article class="member-card">
                      <div class="member-card-header">
                        <div>
                          <span class="muted">ชื่อสมาชิก</span>
                          <h3>${escapeHtml(member.member_name)}</h3>
                        </div>
                        ${memberDue ? renderDueBadge(memberDue) : ""}
                      </div>
                      <div class="member-payment">
                        <span>วันที่ต้องชำระ</span>
                        <strong>${formatDate(member.payment_due_date)}</strong>
                      </div>
                      <div class="member-meta-grid">
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
                    </article>
                  `;
                })
                .join("")}
            </div>`
          : `<div class="empty-state"><p>ยังไม่มีสมาชิกในกลุ่มนี้</p></div>`
      }
    </section>
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
  } catch (error) {
    showToast(error.message, true);
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
  const payload = {
    group_name: clean(formData.get("group_name")),
    status: clean(formData.get("status")) || "active",
    data_updated_date: clean(formData.get("data_updated_date")) || todayInput()
  };

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
    birthday_day: numberOrNull(formData.get("birthday_day")),
    birthday_month: numberOrNull(formData.get("birthday_month")),
    birthday_year: numberOrNull(formData.get("birthday_year")),
    email: clean(formData.get("email")),
    email_type: clean(formData.get("email_type")) || "store",
    payment_due_date: clean(formData.get("payment_due_date")) || null,
    data_updated_date: clean(formData.get("data_updated_date")) || todayInput()
  };

  if (!payload.access_code) {
    throw new Error("กรุณาใส่รหัสเข้าดูของสมาชิก");
  }

  if ((payload.birthday_day && !payload.birthday_month) || (!payload.birthday_day && payload.birthday_month)) {
    throw new Error("วันเกิดต้องใส่ทั้งวันและเดือน หรือเว้นว่างทั้งหมด");
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
    data_updated_date: clean(formData.get("data_updated_date")) || todayInput()
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
  const today = new Date(`${todayInput()}T00:00:00`);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 7);

  return state.members
    .filter((member) => {
      if (!member.payment_due_date) return false;
      const due = new Date(`${member.payment_due_date}T00:00:00`);
      return due >= today && due <= limit;
    })
    .sort((a, b) => String(a.payment_due_date).localeCompare(String(b.payment_due_date)));
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

function getCustomerPortalSummary(groups) {
  const dueItems = groups
    .map((group) => getGroupDueSummary(group))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    groupCount: groups.length,
    activeCount: groups.filter((group) => group.status === "active").length,
    nextDue: dueItems[0] || null
  };
}

function getGroupDueSummary(group) {
  const dueItems = (group.members || [])
    .map((member) => getDueInfo(member.payment_due_date))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return dueItems[0] || null;
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
  return `<span class="badge due-${dueInfo.status}">${escapeHtml(dueInfo.label)}</span>`;
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
  const day = item.birthday_day ? String(item.birthday_day).padStart(2, "0") : "";
  const month = item.birthday_month ? String(item.birthday_month).padStart(2, "0") : "";
  const year = item.birthday_year ? String(item.birthday_year) : "";

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

function parseDateInput(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
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
