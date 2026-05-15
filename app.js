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
  groups: [],
  customers: [],
  customerGroups: [],
  members: [],
  announcements: [],
  editing: null,
  portal: null,
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
  renderCustomer();
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
  if (hashRoute === "admin" || hashRoute === "customer") return hashRoute;
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/admin")) return "admin";
  return "customer";
}

function navigate(route) {
  const useHash = window.location.protocol === "file:";
  const url = useHash ? `#${route}` : `/${route}`;
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
    topnav.innerHTML = `<button type="button" data-nav="customer">หน้าลูกค้า</button>`;
    return;
  }

  topnav.innerHTML = "";
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
    customers: renderCustomersAdmin(),
    members: renderMembersAdmin(),
    announcements: renderAnnouncementsAdmin()
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
    ["customers", "User"],
    ["members", "สมาชิก"],
    ["announcements", "ประกาศ/โปรโมชั่น"]
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
  const activeCustomers = state.customers.filter((customer) => customer.status === "active").length;
  const dueSoon = getDueSoonMembers();

  return `
    <section class="section-block">
      <div class="grid stats-grid">
        ${renderStat("กลุ่มทั้งหมด", state.groups.length)}
        ${renderStat("กลุ่มใช้งานได้", activeGroups)}
        ${renderStat("User เปิดใช้งาน", activeCustomers)}
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

function renderCustomersAdmin() {
  const record = getEditingRecord("customer", state.customers);
  const selectedGroups = record ? getCustomerGroupIds(record.id) : [];

  return `
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>${record ? "แก้ไข User" : "เพิ่ม User"}</h2>
          <p>User คือคนที่ได้รับรหัสจากร้านเพื่อดูเฉพาะกลุ่มที่กำหนด</p>
        </div>
      </div>
      <form class="form-grid" data-form="customer">
        <label class="field">
          <span>ชื่อ User / ลูกค้า</span>
          <input name="display_name" value="${attr(record?.display_name)}" required />
        </label>
        <label class="field">
          <span>รหัสเข้าใช้งาน</span>
          <input name="access_code" value="${attr(record?.access_code)}" placeholder="YT-A7K29" required />
        </label>
        <label class="field">
          <span>อีเมลลูกค้า</span>
          <input name="email" type="email" value="${attr(record?.email)}" />
        </label>
        <label class="field">
          <span>สถานะ</span>
          <select name="status">
            ${option("active", "เปิดใช้งาน", record?.status)}
            ${option("inactive", "ปิดใช้งาน", record?.status)}
          </select>
        </label>
        <label class="field full">
          <span>หมายเหตุ</span>
          <textarea name="note">${escapeHtml(record?.note || "")}</textarea>
        </label>
        <fieldset class="checkbox-grid full">
          <legend>กลุ่มที่ User เห็นได้</legend>
          <div class="checkbox-list">
            ${
              state.groups.length
                ? state.groups
                    .map(
                      (group) => `
                        <label class="check-row">
                          <input
                            name="group_ids"
                            type="checkbox"
                            value="${attr(group.id)}"
                            ${selectedGroups.includes(group.id) ? "checked" : ""}
                          />
                          <span>${escapeHtml(group.group_name)}</span>
                        </label>
                      `
                    )
                    .join("")
                : `<p class="muted">ต้องเพิ่มกลุ่มก่อนจึงจะผูก User ได้</p>`
            }
          </div>
        </fieldset>
        <div class="toolbar full">
          <button class="primary-button" type="submit">${record ? "บันทึกการแก้ไข" : "เพิ่ม User"}</button>
          ${record ? `<button class="ghost-button" type="button" data-action="cancel-edit">ยกเลิก</button>` : ""}
        </div>
      </form>
      ${renderCustomersTable()}
    </section>
  `;
}

function renderCustomersTable() {
  if (!state.customers.length) {
    return `<div class="empty-state"><p>ยังไม่มี User</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>รหัส</th>
            <th>อีเมล</th>
            <th>สถานะ</th>
            <th>กลุ่มที่เห็นได้</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${state.customers
            .map((customer) => {
              const groupNames = getCustomerGroupIds(customer.id)
                .map((groupId) => getGroupName(groupId))
                .filter(Boolean);
              return `
                <tr>
                  <td><strong>${escapeHtml(customer.display_name)}</strong></td>
                  <td><code>${escapeHtml(customer.access_code)}</code></td>
                  <td>${escapeHtml(customer.email || "-")}</td>
                  <td>${renderCustomerStatusBadge(customer.status)}</td>
                  <td>${groupNames.length ? groupNames.map((name) => `<span class="badge">${escapeHtml(name)}</span>`).join(" ") : "-"}</td>
                  <td class="actions">
                    <button class="ghost-button" type="button" data-action="edit-customer" data-id="${attr(customer.id)}">แก้ไข</button>
                    <button class="danger-button" type="button" data-action="delete-customer" data-id="${attr(customer.id)}">ลบ</button>
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

function renderCustomer() {
  if (!state.portal) {
    app.innerHTML = `
      <section class="customer-entry">
        <div class="section-block">
          <div class="section-header">
            <div>
              <h1>ตรวจสอบกลุ่มของคุณ</h1>
              <p>กรอกรหัสที่ได้รับจากร้าน</p>
            </div>
          </div>
          <form class="form-grid" data-form="customer-code">
            <label class="field full">
              <span>รหัสลูกค้า</span>
              <input name="access_code" autocomplete="one-time-code" placeholder="YT-A7K29" required />
            </label>
            <div class="toolbar full">
              <button class="primary-button" type="submit">ดูข้อมูล</button>
            </div>
          </form>
        </div>
      </section>
    `;
    return;
  }

  const selectedGroup =
    state.portal.groups.find((group) => group.id === state.selectedGroupId) || null;

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${escapeHtml(state.portal.customer.display_name)}</h1>
        <p>ข้อมูลกลุ่มที่ร้านกำหนดให้รหัสนี้</p>
      </div>
      <div class="toolbar">
        ${selectedGroup ? `<button class="ghost-button" type="button" data-action="back-groups">กลับไปหน้ากลุ่ม</button>` : ""}
        <button class="danger-button" type="button" data-action="clear-customer">ออกจากข้อมูลนี้</button>
      </div>
    </div>

    ${renderCustomerAnnouncements(state.portal.announcements || [])}

    ${
      selectedGroup
        ? renderCustomerGroupDetail(selectedGroup)
        : renderCustomerGroupCards(state.portal.groups || [])
    }
  `;
}

function renderCustomerAnnouncements(items) {
  if (!items.length) return "";

  return `
    <section class="section-block">
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
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>กลุ่มของคุณ</h2>
        </div>
      </div>
      <div class="group-grid">
        ${groups
          .map(
            (group) => `
              <button class="group-card" type="button" data-action="select-customer-group" data-id="${attr(group.id)}">
                <span>${renderStatusBadge(group.status)}</span>
                <h3>${escapeHtml(group.group_name)}</h3>
                <span class="muted">อัปเดท ${formatDate(group.data_updated_date)}</span>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCustomerGroupDetail(group) {
  return `
    <section class="section-block">
      <div class="section-header">
        <div>
          <h2>${escapeHtml(group.group_name)}</h2>
          <p>อัปเดท ${formatDate(group.data_updated_date)}</p>
        </div>
        ${renderStatusBadge(group.status)}
      </div>
      ${
        group.members?.length
          ? `<div class="detail-list">
              ${group.members
                .map(
                  (member) => `
                    <div class="detail-row">
                      <div>
                        <span class="muted">ชื่อสมาชิก</span>
                        <strong>${escapeHtml(member.member_name)}</strong>
                      </div>
                      <div>
                        <span class="muted">วันเกิด</span>
                        <strong>${formatBirthday(member)}</strong>
                      </div>
                      <div>
                        <span class="muted">ประเภทอีเมล</span>
                        <strong>${emailTypeLabel(member.email_type)}</strong>
                      </div>
                      <div>
                        <span class="muted">วันที่ต้องชำระ</span>
                        <strong>${formatDate(member.payment_due_date)}</strong>
                        <span class="muted">อัปเดท ${formatDate(member.data_updated_date)}</span>
                      </div>
                    </div>
                  `
                )
                .join("")}
            </div>`
          : `<div class="empty-state"><p>ยังไม่มีสมาชิกในกลุ่มนี้</p></div>`
      }
    </section>
  `;
}

async function loadAdminData() {
  const [groups, customers, customerGroups, members, announcements] = await Promise.all([
    supabase.from("groups").select("*").order("group_name", { ascending: true }),
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("customer_groups").select("*"),
    supabase.from("members").select("*").order("member_name", { ascending: true }),
    supabase
      .from("announcements")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false })
  ]);

  [groups, customers, customerGroups, members, announcements].forEach((result) => {
    if (result.error) throw result.error;
  });

  state.groups = groups.data || [];
  state.customers = customers.data || [];
  state.customerGroups = customerGroups.data || [];
  state.members = members.data || [];
  state.announcements = announcements.data || [];
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
    if (formType === "customer") await saveCustomer(form);
    if (formType === "member") await saveMember(form);
    if (formType === "announcement") await saveAnnouncement(form);
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
    if (action === "edit-customer") editRecord("customers", "customer", id, "customers");
    if (action === "edit-member") editRecord("members", "member", id, "members");
    if (action === "edit-announcement") {
      editRecord("announcements", "announcement", id, "announcements");
    }

    if (action === "delete-group") await deleteRecord("groups", id, "ลบกลุ่มนี้หรือไม่");
    if (action === "delete-customer") await deleteRecord("customers", id, "ลบ User นี้หรือไม่");
    if (action === "delete-member") await deleteRecord("members", id, "ลบสมาชิกนี้หรือไม่");
    if (action === "delete-announcement") {
      await deleteRecord("announcements", id, "ลบประกาศ/โปรโมชั่นนี้หรือไม่");
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
      state.selectedGroupId = null;
      renderCustomer();
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
  state.selectedGroupId = null;
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

async function saveCustomer(form) {
  const formData = new FormData(form);
  const record = getEditingRecord("customer", state.customers);
  const groupIds = [...form.querySelectorAll('input[name="group_ids"]:checked')].map(
    (input) => input.value
  );
  const payload = {
    display_name: clean(formData.get("display_name")),
    access_code: clean(formData.get("access_code")),
    email: clean(formData.get("email")) || null,
    status: clean(formData.get("status")) || "active",
    note: clean(formData.get("note")) || null
  };

  let customerId = record?.id;
  if (record) {
    await checked(supabase.from("customers").update(payload).eq("id", record.id));
  } else {
    const result = await checked(
      supabase.from("customers").insert(payload).select("id").single()
    );
    customerId = result.data.id;
  }

  await checked(supabase.from("customer_groups").delete().eq("customer_id", customerId));
  if (groupIds.length) {
    await checked(
      supabase.from("customer_groups").insert(
        groupIds.map((groupId) => ({
          customer_id: customerId,
          group_id: groupId
        }))
      )
    );
  }

  await reloadAfterSave("บันทึก User แล้ว");
}

async function saveMember(form) {
  const formData = new FormData(form);
  const record = getEditingRecord("member", state.members);
  const payload = {
    group_id: clean(formData.get("group_id")),
    member_name: clean(formData.get("member_name")),
    birthday_day: numberOrNull(formData.get("birthday_day")),
    birthday_month: numberOrNull(formData.get("birthday_month")),
    birthday_year: numberOrNull(formData.get("birthday_year")),
    email: clean(formData.get("email")),
    email_type: clean(formData.get("email_type")) || "store",
    payment_due_date: clean(formData.get("payment_due_date")) || null,
    data_updated_date: clean(formData.get("data_updated_date")) || todayInput()
  };

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

function getCustomerGroupIds(customerId) {
  return state.customerGroups
    .filter((item) => item.customer_id === customerId)
    .map((item) => item.group_id);
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

function renderStatusBadge(status) {
  if (status === "maintenance") return `<span class="badge warning">ปรับปรุง</span>`;
  return `<span class="badge success">ใช้งานได้</span>`;
}

function renderCustomerStatusBadge(status) {
  if (status === "inactive") return `<span class="badge danger">ปิดใช้งาน</span>`;
  return `<span class="badge success">เปิดใช้งาน</span>`;
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
  return String(value).slice(0, 10);
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
