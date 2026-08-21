# CRS Equipment Borrowing System

ระบบเว็บภาษาไทยสำหรับจัดการอุปกรณ์ส่วนกลาง ตั้งแต่ค้นหาและสแกน QR ไปจนถึงขอยืม อนุมัติ รับอุปกรณ์ แจ้งคืน ตรวจสภาพ และบันทึกประวัติ โดยใช้บริการของ Google Workspace เป็นหลักและไม่ต้องมีเซิร์ฟเวอร์แยก

## เทคโนโลยี

- Frontend: HTML5, CSS3, JavaScript, Bootstrap 5, Noto Sans Thai
- Backend: Google Apps Script V8
- Database: Google Sheets
- File storage: Google Drive
- Authentication: Google Workspace session
- QR: ไลบรารีโอเพนซอร์สบนฝั่งเบราว์เซอร์

## ขอบเขต V1

ระบบรองรับ Dashboard, รายการและรายละเอียดอุปกรณ์, ค้นหา/กรอง/เรียง/แบ่งหน้า, QR deep link, คำขอยืม, อนุมัติ/ปฏิเสธ, checkout, แจ้งคืน, ตรวจรับคืน, overdue, ประวัติ, ผู้ใช้ และหมวดหมู่ พร้อมการตรวจสิทธิ์ทั้งหน้าเว็บและ backend

## สถาปัตยกรรมโดยย่อ

เว็บเป็น single-page application ที่ Apps Script HTML Service ให้บริการ หน้าเว็บเรียก RPC แบบ asynchronous ผ่าน `google.script.run` ไปยัง API wrappers ซึ่งตรวจ identity/role ก่อนเรียก domain services ส่วน domain services บังคับ state transition ภายใต้ Script Lock และอ่านเขียนผ่าน repository ที่อิงชื่อ header ของ Google Sheets เท่านั้น

อ่านรายละเอียดได้ที่ [Architecture](docs/ARCHITECTURE.md), [Database](docs/DATABASE.md) และ [Workflows](docs/WORKFLOWS.md)

## ข้อกำหนดสำคัญด้านบัญชี

V1 ออกแบบสำหรับผู้ใช้ภายใน Google Workspace domain เดียวกัน การ deploy ต้องจำกัดผู้เข้าถึงตาม domain และต้องทดสอบว่า `Session.getActiveUser().getEmail()` คืนอีเมลของผู้ใช้จริง หากเป็นบัญชี Gmail ส่วนตัวหรือข้าม domain อาจได้อีเมลว่าง ซึ่งระบบจะปฏิเสธการเข้าใช้งานตามหลัก fail closed

## การติดตั้ง

คู่มือฉบับสมบูรณ์อยู่ที่ `docs/DEPLOYMENT.md` เมื่อจบ Phase 7 ขั้นตอนหลักคือสร้าง Google Sheet/Drive folder, คัดลอกไฟล์ใน `src/` เข้า Apps Script, ตั้ง Script Properties, รัน `setupSystem()`, authorize และ deploy เป็น Web app

## สถานะ

กำลังพัฒนา V1 บน branch `codex/initial-v1` โดยส่งมอบและ commit แยกตาม 7 phases ที่ระบุในสเปก

