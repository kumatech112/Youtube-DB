# FKP Shop

เว็บจัดการบริการพรีเมียมของ FKP Shop สำหรับแอดมิน 1 คน และหน้าลูกค้าที่เข้าด้วยรหัสจากร้าน เพื่อดูบริการ ส่งสลิป และติดตามสถานะการตรวจสอบ

## โครงระบบ

- `Vercel` ใช้โฮสต์หน้าเว็บ
- `Supabase Database` เก็บลูกค้า, บริการลูกค้า, สลิปชำระเงิน, ประวัติการทำรายการ, ประกาศ, โปรโมชั่น
- `Supabase Auth` ใช้ล็อกอินแอดมิน
- `Supabase Storage` เก็บรูปประกาศ/โปรโมชั่น และสลิปใน bucket ส่วนตัว

## ไฟล์สำคัญ

- `index.html` หน้าเว็บหลัก
- `app.js` logic ฝั่งแอดมินและลูกค้า
- `styles.css` หน้าตาเว็บ
- `config.js` ใส่ Supabase URL และ anon key
- `supabase/schema.sql` SQL สำหรับสร้างฐานข้อมูล, RLS, RPC, Storage policy
- `supabase/commercial-system.sql` SQL สำหรับระบบลูกค้า, บริการลูกค้า, สลิป, audit log และ migration จากสมาชิกเดิม
- `vercel.json` rewrite `/admin` และ `/customer` ให้ใช้หน้าเว็บเดียวกัน

## ตั้งค่า Supabase

1. เปิด Supabase project
2. ไปที่ `SQL Editor`
3. วางและรันไฟล์ `supabase/schema.sql`
4. วางและรันไฟล์ `supabase/commercial-system.sql` เพื่อเปิดระบบเชิงพาณิชย์และย้ายสมาชิกเดิมเป็นลูกค้า
5. ไปที่ `Authentication > Users`
6. สร้าง user แอดมินด้วยอีเมล/รหัสผ่านของคุณ
7. คัดลอก `User UID`
8. กลับไปที่ `SQL Editor` แล้วรันคำสั่งนี้ โดยเปลี่ยน UUID และอีเมล:

```sql
insert into public.admin_profiles (user_id, email)
values ('00000000-0000-0000-0000-000000000000', 'you@example.com')
on conflict (user_id) do update set email = excluded.email, is_active = true;
```

ถ้าอัปโหลดรูปไม่ได้เพราะไม่พบ bucket ให้รันไฟล์ `supabase/storage.sql` เพิ่ม หรือสร้าง bucket เองใน `Storage > New bucket`:

```text
Name: public-assets
Public bucket: เปิด
```

ระบบสลิปใช้ bucket นี้:

```text
Name: payment-slips
Public bucket: ปิด
```

ถ้าโปรเจกต์เคยใช้ระบบ `User` เดิม ให้รันไฟล์ `supabase/remove-users.sql` เพิ่มหนึ่งครั้ง เพื่อย้ายรหัสเข้าดูไปอยู่ที่ตาราง `members`

ถ้าต้องการเปิดหน้าโปรโมต/หน้าแรก ให้รันไฟล์ `supabase/promo.sql` เพิ่มหนึ่งครั้ง เพื่อสร้างตาราง `site_settings`, `service_plans` และ RPC `get_public_home`

## ตั้งค่าเว็บ

เปิดไฟล์ `config.js` แล้วใส่ค่าจาก Supabase:

```js
window.YT_DB_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

หาได้จาก Supabase:

- `Project Settings > API > Project URL`
- `Project Settings > API > anon public key`

ห้ามใช้ `service_role key` ในไฟล์นี้

## ใช้งาน

ฝั่งแอดมิน:

```text
/admin
```

ถ้าทดสอบผ่าน Python local server ให้ใช้:

```text
http://localhost:5173/#admin
```

จัดการได้:

- ลูกค้าและรหัสลูกค้า
- บริการของลูกค้า 1 คนมีได้หลายบริการ
- สลิป/การชำระเงิน พร้อมอนุมัติแบบต่ออายุเป็นเดือนหรือกำหนดวันหมดอายุเอง
- ประวัติลูกค้าและ audit log
- ประกาศ/โปรโมชั่นพร้อมรูป
- หน้าโปรโมต บริการ ราคา และลิงก์ LINE/Facebook
- การ์ดสินค้า/บริการพร้อมรูป ไอคอน และสถานะมีที่ว่าง/เต็ม
- กลุ่ม/สมาชิกเดิมยังอยู่ในเมนู Legacy เพื่ออ้างอิงข้อมูลเก่า

หน้าโปรโมตสาธารณะ:

```text
/
```

ฝั่งลูกค้า:

```text
/customer
```

ถ้าทดสอบผ่าน Python local server ให้ใช้:

```text
http://localhost:5173/#customer
```

ลูกค้ากรอกรหัสลูกค้าที่ร้านให้ แล้วเห็นข้อมูลบริการของตัวเอง
ลูกค้าจะเห็นเฉพาะข้อมูลของตัวเอง:

- ข้อมูลลูกค้า
- บริการที่ใช้อยู่และวันหมดอายุ
- ฟอร์มส่งสลิป 1 ใบต่อ 1 บริการ
- ประวัติสลิปของตัวเอง

## Deploy ขึ้น Vercel

1. สร้าง GitHub repository แล้วอัปโหลดไฟล์ชุดนี้
2. เข้า Vercel แล้วเลือก `Add New Project`
3. Import repository จาก GitHub
4. Framework preset เลือก `Other`
5. Build Command เว้นว่าง
6. Output Directory ใช้ `.`
7. Deploy

หลัง deploy จะเข้าได้ที่:

```text
https://your-project.vercel.app/customer
https://your-project.vercel.app/admin
```

## ความปลอดภัยที่ใช้ในโปรเจกต์นี้

- เปิด Row Level Security ทุกตาราง
- แอดมินต้องอยู่ใน `admin_profiles` เท่านั้นจึงอ่าน/แก้ไขข้อมูลได้
- ลูกค้าเรียกข้อมูลผ่านฟังก์ชัน `get_customer_portal`
- ฟังก์ชันลูกค้าคืนเฉพาะข้อมูลลูกค้าตาม `access_code`
- ลูกค้าส่งสลิปผ่าน RPC และ upload เข้า bucket `payment-slips`
- bucket `payment-slips` เป็น private และแอดมินดูรูปผ่าน signed URL ชั่วคราว
- รูปประกาศ/โปรโมชั่นเก็บใน bucket `public-assets`
