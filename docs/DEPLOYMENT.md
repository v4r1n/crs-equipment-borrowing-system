# คู่มือติดตั้ง Deploy และส่งมอบระบบ

คู่มือนี้ใช้สำหรับนำ CRS Equipment Borrowing System รุ่น `0.1.0` ไปติดตั้งบน Google Workspace จริง ตั้งแต่สร้างทรัพยากรจนถึงตรวจรับ User/Admin และดูแลหลังเปิดใช้งาน ขั้นตอนทั้งหมดใช้บริการ Google Workspace และไม่ต้องมี VPS หรือฐานข้อมูลแยก

> สถานะของ repository เป็น source ที่ผ่านการทดสอบในเครื่อง ไม่ใช่หลักฐานว่าระบบถูก deploy ในโดเมนขององค์กรแล้ว ผู้รับผิดชอบ deployment ต้องทำรายการใน [Deployment Acceptance Matrix](../tests/MANUAL_ACCEPTANCE.md) ให้ผ่านก่อนเปิดใช้งานจริง

## รูปแบบ deployment ที่ระบบนี้รองรับ

| รายการ | ค่าที่กำหนด |
|---|---|
| Apps Script project | Standalone project ภายใต้บัญชี Google Workspace ขององค์กร |
| Execute as | ผู้ deploy (`Me` / `USER_DEPLOYING`) |
| Who has access | เฉพาะผู้ใช้ใน Workspace domain เดียวกัน (`DOMAIN`) |
| Database | Google Sheet ที่ระบุด้วย `SPREADSHEET_ID` |
| Image storage | Google Drive folder ที่ระบุด้วย `DRIVE_FOLDER_ID` |
| Visitor identity | `Session.getActiveUser().getEmail()` และต้องตรงกับ Users row ที่ Active |
| Production URL | URL แบบ versioned deployment ที่ลงท้ายด้วย `/exec` |

รูปแบบนี้ทำให้ผู้ใช้ทั่วไปไม่ต้องมีสิทธิ์อ่านหรือแก้ไข Sheet/Drive folder โดยตรง เพราะ backend ทำงานด้วยสิทธิ์ของผู้ deploy การใช้งานและ quota ของบริการที่ backend เรียกจึงรวมอยู่ที่บัญชีผู้ deploy และต้องมีผู้ติดตาม execution health แต่ Google ระบุว่าอีเมลจาก Active User อาจว่างได้ในบางบริบท แม้ข้อจำกัดนี้โดยทั่วไปไม่เกิดเมื่อ developer และผู้ใช้เป็นสมาชิก Workspace domain เดียวกัน ดังนั้นการทดสอบด้วยบัญชี User คนละบัญชีกับผู้ deploy จึงเป็น release gate ที่ห้ามข้าม

ห้ามแก้ไปใช้ `Session.getEffectiveUser()` เพราะ deployment แบบ execute-as-deployer จะได้อีเมลของผู้ deploy ไม่ใช่ผู้เข้าชม และห้ามเปิดเป็น `Anyone` หรือ anonymous เพื่อแก้ปัญหา identity

## สิ่งที่ต้องเตรียม

- บัญชี Workspace อายุการใช้งานระยะยาวที่องค์กรควบคุมสำหรับเป็นผู้ deploy ไม่ควรใช้บัญชีพนักงานที่อาจถูกปิดเมื่อย้ายงาน
- สิทธิ์สร้าง/แก้ไข Google Sheet, Google Drive folder และ Apps Script project ด้วยบัญชีเดียวกัน
- อีเมล Admin เริ่มต้นอย่างน้อยหนึ่งบัญชีใน domain เดียวกัน โดยบัญชีที่รัน setup ครั้งแรกต้องอยู่ในรายการนี้
- บัญชี User ทดสอบอย่างน้อยสองบัญชีใน domain เดียวกันสำหรับทดสอบสิทธิ์และ double booking โดยใช้ browser profile แยกจาก Admin
- โทรศัพท์ Android/iOS อย่างน้อยหนึ่งเครื่องสำหรับทดสอบ QR, native camera/file picker และ responsive UI
- Source จาก commit ที่ผ่าน review; บันทึกค่า `git rev-parse HEAD` ไว้ใน change record ก่อน deploy

หากข้อมูลจริงต้องสะอาด แนะนำให้ทำ UAT ใน Apps Script project, Sheet และ Drive folder ชุดแยกต่างหาก เพราะ History และ Operations เป็นหลักฐานแบบไม่ลบย้อนหลัง การทดลอง lifecycle ในฐานข้อมูล production จะคงอยู่ใน audit trail

## 1. สร้าง Google Sheet

1. ลงชื่อเข้าใช้ด้วยบัญชี Workspace ที่จะเป็นผู้ deploy
2. สร้าง Google Sheet เปล่า เช่น `CRS Equipment - Production`
3. ไม่ต้องสร้าง tab หรือ header เอง `setupSystem()` จะสร้างและตรวจ schema ให้ทั้งหมด
4. เปิด URL ของ Sheet แล้วคัดลอกข้อความระหว่าง `/d/` และ `/edit` เก็บเป็น `SPREADSHEET_ID`
5. จำกัด Share ของ Sheet ไว้เฉพาะบัญชีผู้ deploy และผู้ดูแลข้อมูลที่จำเป็น ผู้ใช้ระบบทั่วไปต้องไม่มีสิทธิ์ตรงทุกระดับ รวม Viewer/Commenter และสิทธิ์ที่ได้ผ่าน group/link

ตัวอย่างตำแหน่ง ID:

```text
https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
```

ระบบสร้าง/ดูแล 11 tabs ต่อไปนี้: `Equipment`, `Users`, `Borrow`, `Categories`, `IncludedItems`, `BorrowItems`, `History`, `Operations`, `Settings`, `Sequences` และ `SchemaMigrations` โดยไม่ลบ tab อื่น เช่น `Sheet1` หากต้องการลบ tab เริ่มต้นให้ยืนยันก่อนว่าไม่มีข้อมูลและไม่ใช่หนึ่งใน 11 ชื่อที่ระบบดูแล

## 2. เปิด Apps Script

1. ไปที่ [script.google.com](https://script.google.com/) แล้วเลือก **New project** เพื่อสร้าง standalone project
2. ตั้งชื่อ เช่น `CRS Equipment Borrowing - Production`
3. เปิด **Project Settings** แล้วตรวจ Time zone เป็น `(GMT+07:00) Bangkok`
4. เปิดตัวเลือก **Show "appsscript.json" manifest file in editor**
5. บันทึก Script ID และเจ้าของ project ไว้ใน change record ขององค์กร โดยไม่ใส่ค่าจริงลง Git
6. จำกัด Editor ของ Apps Script project ไว้เฉพาะ release operators ที่อนุมัติแล้ว เพราะ Editor เปลี่ยน code และ Script Properties ที่ production อ่านได้ทันที

Standalone project เป็นรูปแบบหลักของระบบ แม้ code จะรองรับ bound script เป็น fallback ก็ตาม Production ต้องตั้ง `SPREADSHEET_ID` อย่างชัดเจนเพื่อไม่ให้ชี้ฐานข้อมูลผิดไฟล์

## 3. เพิ่ม Source Code

วิธีที่ไม่ต้องติดตั้งเครื่องมือเพิ่มคือสร้างไฟล์ใน Apps Script editor แล้วคัดลอกเนื้อหาจาก `src/` ให้ตรงชื่อทุกไฟล์

1. แทนที่เนื้อหา `Code.gs` ที่ project สร้างมาให้ โดยลบ `myFunction` เดิมแล้ววาง `src/Code.gs`
2. สำหรับไฟล์ `.gs` อีก 22 ไฟล์ ให้กด **Add a file > Script** แล้วใส่ชื่อฐานโดยไม่ต้องพิมพ์ `.gs`
3. สำหรับไฟล์ `.html` ให้กด **Add a file > HTML** แล้วใส่ชื่อฐานโดยไม่ต้องพิมพ์ `.html`
4. แทนที่ manifest ด้วยเนื้อหาจาก `src/appsscript.json`
5. บันทึกทุกไฟล์ แล้วตรวจว่าไม่มีไฟล์ชื่อซ้ำ เช่น `Code.gs.gs` หรือไฟล์ runtime เก่าที่ไม่มีใน inventory

ไฟล์ Script จำนวน 23 ไฟล์:

```text
Api.gs
Auth.gs
BorrowService.gs
CategoryService.gs
Code.gs
Config.gs
Constants.gs
DashboardService.gs
DataStore.gs
EquipmentService.gs
Errors.gs
HistoryService.gs
ImageService.gs
IntegrityService.gs
Migrations.gs
OperationAdminService.gs
OperationService.gs
Schema.gs
ServiceUtils.gs
Setup.gs
UserService.gs
Utils.gs
Validation.gs
```

ไฟล์ HTML จำนวน 19 ไฟล์:

```text
admin.html
borrow.html
components.html
dashboard.html
equipment.html
equipment-detail.html
index.html
my-borrow.html
scan.html
scripts-admin.html
scripts-api.html
scripts-borrow.html
scripts-core.html
scripts-dashboard.html
scripts-equipment.html
scripts-qr.html
styles.html
vendor-html5-qrcode.html
vendor-qrcode-generator.html
```

รวม manifest แล้วมี runtime source 43 ไฟล์ ไม่ต้องอัปโหลด `docs/`, `tests/`, `node_modules/`, `package.json` หรือไฟล์ license เข้า Apps Script การทำงานของไฟล์ `.gs` ไม่ขึ้นกับลำดับที่แสดงใน editor

ก่อนส่ง source ขึ้น production ผู้พัฒนาควรรันจาก repository ด้วย Node.js 20 ขึ้นไป:

```powershell
npm ci
npx playwright install chromium
npm run test
```

ต้องได้ผลผ่านทั้ง source/security contracts, backend workflow และ Playwright browser acceptance

## 4. ตั้ง Spreadsheet ID

1. ใน Apps Script เปิด **Project Settings**
2. ใต้ **Script Properties** เลือก **Add script property**
3. เพิ่ม Property `SPREADSHEET_ID`
4. ใส่เฉพาะ ID ที่คัดลอกจากข้อ 1 ไม่ใส่ URL, ช่องว่าง หรือวงเล็บ
5. กด **Save script properties**

Script Properties เป็นค่าร่วมของทั้ง web app และเก็บเป็น string ไม่ควรเขียน ID จริงลง `Config.gs` หรือ commit ลง repository

## 5. ตั้ง Drive Folder

1. สร้าง folder ใน Google Drive ด้วยบัญชีผู้ deploy เช่น `CRS Equipment Images - Production`
2. คัดลอก ID หลัง `/folders/` จาก URL ของ folder
3. เพิ่ม Script Property `DRIVE_FOLDER_ID` ด้วย ID นี้
4. เพิ่ม `IMAGE_SHARING` เป็น `DOMAIN_WITH_LINK` ซึ่งเป็นค่าที่แนะนำสำหรับระบบภายใน
5. อย่าแชร์ folder ให้ผู้ใช้ทั่วไปทุกระดับ รวม Viewer/Commenter, group และ link ระบบจะสร้างไฟล์ด้วยสิทธิ์ผู้ deploy และตั้งสิทธิ์อ่านให้แต่ละไฟล์ตาม policy

`IMAGE_SHARING` ยอมรับเพียง:

- `DOMAIN_WITH_LINK` — ผู้มี link ภายใน domain เปิดรูปได้; ใช้เป็นค่ามาตรฐาน
- `ANYONE_WITH_LINK` — ทุกคนที่มี link เปิดรูปได้; ใช้เมื่อองค์กรอนุมัติความเสี่ยงด้านข้อมูลแล้วเท่านั้น

หากนโยบาย Workspace ปิดการแชร์แบบ domain-with-link การอัปโหลดจะ fail closed ด้วย `DRIVE_SHARING_FAILED` ให้ประสาน Workspace Admin แทนการเปลี่ยนเป็น public โดยพลการ

`DOMAIN_WITH_LINK` เป็น boundary ที่กว้างกว่า Users sheet: สมาชิก domain ที่ไม่มี Users row หรือถูก Inactive แต่ได้รับ URL โดยตรงยังอาจดูรูปได้ รูปจึงต้องเป็นภาพครุภัณฑ์ที่องค์กรอนุมัติให้สมาชิก domain เห็น ห้ามใช้เก็บเอกสารลับ, ข้อมูลบุคคล หรือภาพที่ต้องบังคับสิทธิ์ระดับ Users row หากต้องการ policy แคบกว่านี้ต้องออกแบบ authenticated image delivery ใหม่

การเปลี่ยน `IMAGE_SHARING` มีผลเฉพาะไฟล์ที่อัปโหลด/แทนที่หลังเปลี่ยนค่า ไม่ย้อนสิทธิ์ไฟล์เก่า และการแทนรูปไม่ได้ลบรูปเดิมอัตโนมัติเพราะ History อาจอ้าง file ID/URL เดิม ให้ผู้ดูแลทำ permission/storage audit และ reconcile reference ก่อนเปลี่ยนสิทธิ์หรือย้ายไฟล์ ห้ามลบจาก Drive แบบ bulk โดยไม่ตรวจหลักฐาน

## 6. ตั้ง Admin และ domain

เพิ่ม Script Properties อย่างน้อยสองค่า:

| Property | ตัวอย่างรูปแบบ | กฎ |
|---|---|---|
| `ALLOWED_DOMAIN` | `example.com` | ต้องเป็น domain ตัวพิมพ์เล็ก ไม่ใส่ `@` หรือ protocol |
| `ADMIN_EMAILS` | `admin1@example.com,admin2@example.com` | คั่นหลายบัญชีด้วย comma; ทุกบัญชีต้องอยู่ใน `ALLOWED_DOMAIN` |

อย่าปล่อยให้ใช้ค่าเริ่มต้น `admin@example.com` จาก source บัญชีที่กด Run ครั้งแรกต้องอยู่ใน `ADMIN_EMAILS` และต้องเข้าถึง Sheet ได้

`ADMIN_EMAILS` ใช้ bootstrap เฉพาะ setup สำเร็จครั้งแรก หลังจากนั้นให้เพิ่ม/แก้ Admin ผ่านหน้า **Admin > ผู้ใช้** และเฉพาะ Admin ที่ Active อยู่ใน Users sheet เท่านั้นจึงรัน setup ซ้ำได้ การแก้ Property หลัง bootstrap ไม่ได้เพิ่ม Admin row ให้อัตโนมัติ

V1 รองรับ `ALLOWED_DOMAIN` แบบ exact domain เดียวเท่านั้น ไม่รวม secondary domain, subdomain หรือ alias โดยอัตโนมัติ ให้ใช้ primary email ที่ `Session.getActiveUser().getEmail()` คืนจริงใน `ADMIN_EMAILS`/Users และทำ identity pilot แยกทุกกลุ่มผู้ใช้ที่องค์กรจะเปิดให้ใช้งาน

ค่าที่แนะนำก่อนเปิดใช้งาน:

| Property | ค่าที่แนะนำ | ความหมาย |
|---|---:|---|
| `AUTO_PROVISION_USERS` | `false` | ผู้ใช้ต้องถูกเพิ่มโดย Admin ก่อน; ปลอดภัยที่สุด |
| `APP_NAME` | ชื่อระบบขององค์กร | ชื่อบน title/navigation |
| `TIMEZONE` | `Asia/Bangkok` | timezone ธุรกิจ |
| `LOCALE` | `th_TH` | locale ของ Sheet |
| `MAX_IMAGE_BYTES` | `4194304` | รูปสูงสุด 4 MiB; ช่วงที่รองรับ 1,024–10,485,760 bytes |
| `IMAGE_SHARING` | `DOMAIN_WITH_LINK` | policy การอ่านรูป |

ค่า optional/tuning ต่อไปนี้ไม่จำเป็นต้องเพิ่มหากใช้ค่าเริ่มต้น:

| Property | ค่าเริ่มต้น | ช่วง/ข้อกำหนด |
|---|---:|---|
| `APP_VERSION` | `0.1.0` | ควรใช้ค่าจาก source และเปลี่ยนตาม release process เดียวกัน |
| `DEFAULT_PAGE_SIZE` | `24` | จำนวนเต็ม 1–100 และจะไม่เกิน `MAX_PAGE_SIZE` |
| `MAX_PAGE_SIZE` | `100` | จำนวนเต็ม 1–100 |
| `CACHE_TTL_SECONDS` | `120` | จำนวนเต็ม 30–21,600 วินาที |
| `LOCK_TIMEOUT_MS` | `15000` | จำนวนเต็ม 1,000–30,000 มิลลิวินาที |

ค่าตัวเลขที่อยู่นอกช่วงใน `Config.gs` จะกลับไปใช้ค่าเริ่มต้น

## 7. Run Setup

1. ใน Apps Script editor เลือก function `setupSystem` จาก function selector
2. กด **Run** ด้วยบัญชี Admin ที่กำหนดไว้
3. ทำ authorization ตามข้อ 8 เมื่อระบบถาม แล้วรอจน execution จบ
4. เปิด **Execution log** ต้องพบ event `SETUP_COMPLETED` พร้อม `requestId`, Spreadsheet ID, รายชื่อ managed sheets และ warnings
5. หากพบ log ระดับ Error ให้ใช้ `code`, `message` และ `requestId` ตรวจสาเหตุก่อนรันซ้ำ แม้ UI ของ editor อาจแสดงว่า execution จบเพราะ backend แปลง error เป็นผลลัพธ์ที่ปลอดภัย

ผลสำเร็จครั้งแรกต้องมี:

- 11 managed tabs พร้อม header ตาม schema และ warning protection; tab อื่นที่มีอยู่ไม่ถูกลบ
- 13 default categories โดยไม่ซ้ำ
- 7 sequence rows สำหรับ Asset, Borrow, User, Category, Item, BorrowItem และ Log
- Admin rows ตาม `ADMIN_EMAILS`
- migration `001`, `002` และ `003` อย่างละหนึ่ง row
- Settings ที่มี schema version `3`, app version, timezone และ `setup_completed_at`

รัน `setupSystem()` ซ้ำอีกครั้งเพื่อพิสูจน์ idempotency จำนวน categories, admins และ migrations ต้องไม่เพิ่มซ้ำ ห้ามสร้าง header หรือแก้ migration checksum ด้วยมือ

ก่อน deploy อาจมี warning ว่ายังไม่พบ Web app URL ถือว่าปกติ หลังข้อ 9 ต้องตั้ง `WEB_APP_URL` และรัน setup ซ้ำจน warning นี้หาย

## 8. Authorize

Manifest กำหนด least-privilege OAuth scopes ที่ source ใช้ไว้อย่างชัดเจน:

```text
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive
```

ครั้งแรกที่รัน setup Google จะขอให้ผู้ deploy อนุญาต identity email, Google Sheets และ Google Drive ตามรายการนี้

1. ตรวจชื่อ Apps Script project และบัญชีให้ถูกต้อง
2. เปิด **Overview > Project OAuth Scopes** แล้วเทียบให้ตรงกับสาม scope ใน manifest ก่อนกด Allow ระบบนี้ไม่ต้องใช้ Gmail, Calendar หรือ Contacts
3. หาก Workspace Admin บล็อก scope หรือแอปภายใน ให้ส่ง Script ID และ scope ให้ Admin ตรวจ/อนุมัติ อย่าข้าม policy ด้วยบัญชีภายนอก
4. เมื่อ source รุ่นใหม่เพิ่ม Google service ให้รัน function จาก editor อีกครั้งเพื่อ re-authorize ก่อนปล่อย version

บัญชีผู้ deploy ต้องคงสิทธิ์ Editor ของ Sheet และ Drive folder ตลอดอายุ deployment เพราะทุก RPC ทำงานภายใต้สิทธิ์บัญชีนี้

## 9. Deploy Web App

1. กด **Deploy > New deployment**
2. ที่ **Select type** เลือก **Web app**
3. Description ใช้ข้อความที่ตรวจย้อนหลังได้ เช่น `v0.1.0 production rollout`
4. ตั้ง **Execute as** เป็น **Me** หรือบัญชีผู้ deploy (`USER_DEPLOYING`)
5. ตั้ง **Who has access** เป็นผู้ใช้ภายใน Workspace domain เดียวกัน (`DOMAIN`)
6. กด **Deploy** และคัดลอก Web app URL ที่ลงท้ายด้วย `/exec`
7. เก็บ deployment ID, `/exec` URL, source commit, version, ผู้ deploy และวันเวลาไว้ใน change record ที่จำกัดสิทธิ์
8. เพิ่ม Script Property `WEB_APP_URL` เป็น `/exec` URL เต็ม ห้ามมี query string, fragment หรือ `/dev`
9. รัน `setupSystem()` ซ้ำ แล้วตรวจว่าไม่มี warning เรื่อง Web app URL
10. เปิด `/exec` ด้วย Admin และตรวจว่า QR ในหน้า Equipment Detail สร้าง URL origin/path เดียวกับ deployment

URL `/dev` จาก **Test deployments** เปิดได้เฉพาะผู้มีสิทธิ์แก้ script และใช้ code ล่าสุด จึงใช้ตรวจระหว่างพัฒนาเท่านั้น ห้ามแจกเป็น production URL

### Identity pilot ที่ต้องผ่านก่อนเปิดใช้

หลัง deploy ให้ Admin เพิ่มบัญชี User ทดสอบในหน้า Admin ก่อน แล้วเปิด `/exec` ด้วย browser profile ของ User คนนั้น ระบบต้องแสดงอีเมลของ User จริง ไม่ใช่อีเมลผู้ deploy

หากระบบแจ้งว่าไม่พบอีเมลผู้ใช้งาน:

1. ตรวจว่า User และผู้ deploy อยู่ Workspace domain เดียวกัน
2. ตรวจ deployment ว่า access จำกัด domain และเปิดด้วย `/exec`
3. ออกจากบัญชี Google อื่นหรือใช้ browser profile แยกเพื่อไม่ให้เลือกบัญชีผิด
4. ให้ Workspace Admin ตรวจ identity/session policy
5. หยุด rollout หากยังได้อีเมลว่าง ห้ามเปลี่ยนเป็น EffectiveUser, anonymous หรือ public access

หากองค์กรจำเป็นต้องใช้ execute-as-user ต้อง review สถาปัตยกรรมใหม่ เพราะผู้ใช้ทุกคนจะต้อง authorize scopes และต้องมีสิทธิ์เข้าถึง Sheet/Drive ซึ่งเปลี่ยน data-isolation model ของ V1

## 10. ทดสอบ User

ใช้บัญชี User จริงที่ Admin เพิ่มเป็น `USER` และ `ACTIVE`; ค่าเริ่มต้น `AUTO_PROVISION_USERS=false` จะปฏิเสธบัญชีที่ยังไม่มี row

1. เปิด `/exec` และตรวจชื่อ/อีเมลในหน้า Account
2. ตรวจว่าไม่เห็นเมนู Admin และเปิด `?view=admin` แล้วไม่ได้สิทธิ์
3. เปิด Dashboard, ค้นหา/กรอง/เรียงอุปกรณ์ และดูทั้ง Card/Table
4. เปิด Equipment Detail และ Included Items
5. Scan QR หรือกรอก Asset ID ด้วยมือ ต้องเปิด asset ที่ตรงกันโดยไม่ทำ mutation
6. ขอยืม asset ที่ `AVAILABLE`; ตรวจสถานะ `PENDING_APPROVAL` ใน My Borrow
7. ให้บัญชี User ทดสอบคนที่สองลองขอ asset เดิม ต้องถูกปฏิเสธและไม่เกิด double booking
8. หลัง Admin checkout ตรวจว่า User เห็นสถานะกำลังยืมและ due date
9. กดแจ้งคืน ตรวจว่าสถานะเป็นรอคืนและไม่สามารถแจ้งซ้ำ
10. ตรวจ personal history และข้อความ Thai success/error/loading บน desktop และโทรศัพท์

ทดสอบ unknown same-domain, inactive, external-domain และ signed-out identity เพิ่มตาม matrix ทุกกรณีต้อง fail closed โดยไม่มีข้อมูลหรือ mutation รั่วไหล

## 11. ทดสอบ Admin

1. เปิด Dashboard และเทียบจำนวน Total, Available, Pending, Borrowed, Overdue, Damaged, Maintenance และ Lost กับข้อมูลใน Sheet
2. สร้าง/แก้ category และตรวจ unique name/prefix/status
3. เพิ่ม User, เปลี่ยน role/status และยืนยันว่า User ปกติเรียก admin action ไม่ได้
4. เพิ่ม Equipment พร้อม Included Items; ตรวจ Asset ID อัตโนมัติและ duplicate serial validation
5. อัปโหลด/เปลี่ยนรูป JPEG, PNG หรือ WebP แล้วเปิดรูปจากบัญชี User ใน domain; ยืนยันว่า external/signed-out เปิดไม่ได้ และบันทึกว่า same-domain link holder เป็นขอบเขตที่องค์กรยอมรับ
6. Download QR sticker, พิมพ์และ scan ด้วย Android/iOS; QR ต้องเปิด exact Equipment Detail และไม่ trigger action
7. ทำ lifecycle `request → approve → checkout → return request → inspected return`
8. ตรวจ Included Items ทุกชิ้นและทดสอบ normal/damaged/maintenance/lost disposition ตามกติกา
9. ตรวจ History ว่ามีหนึ่งรายการต่อ command และ old/new status ถูกต้อง
10. เปิด Integrity audit ต้องไม่มี Error สำหรับข้อมูลที่ปกติ
11. ตรวจ Operations ที่ `STARTED`; กู้คืนหรือ abort เฉพาะกรณีที่หน้า Admin แสดงว่าปลอดภัย ห้ามแก้ row เอง
12. ตรวจ responsive ที่ความกว้าง 320, 768 และ 1440 pixels รวม keyboard/focus/dialog

บันทึก PASS/FAIL, ผู้ทดสอบ, วันเวลา, browser/device และหลักฐานที่ไม่เปิดเผย Sheet/Drive ID สู่สาธารณะใน [Deployment Acceptance Matrix](../tests/MANUAL_ACCEPTANCE.md)

## เกณฑ์ Go-live

เปิดให้ผู้ใช้จริงได้เมื่อครบทุกข้อ:

- `npm run test` ผ่านทั้งหมดบน source commit เดียวกับที่ deploy
- `setupSystem()` ครั้งล่าสุดสำเร็จ ไม่มี configuration warning และการ upload จริงยืนยัน Drive sharing policy แล้ว
- Identity pilot ยืนยัน Active User ของ User และ Admin คนละบัญชีได้ถูกต้อง
- User/Admin lifecycle, Drive image, QR physical scan และ responsive checks ผ่าน
- Integrity audit ไม่มี Error และ Operations ไม่มีรายการ `STARTED` ที่ไม่ทราบสาเหตุ
- User ทั่วไปไม่มี direct access ต่อ Sheet/folder ทุก role และไม่มีสิทธิ์แฝงผ่าน group/link; Apps Script Editor จำกัดเฉพาะ release operators
- เจ้าของข้อมูลยอมรับว่า `DOMAIN_WITH_LINK` อนุญาตสมาชิก domain ที่มี URL ดูรูปได้แม้ไม่มีสิทธิ์เข้าแอป
- บัญชีผู้ deploy เป็นบัญชีองค์กรระยะยาว มี backup operator และมีแผน redeploy กรณีเจ้าของถูกปิด เพราะ versioned deployment เดิมโอน ownership โดยตรงไม่ได้
- บันทึก source commit, Apps Script version, deployment ID และ `/exec` URL ใน change record แล้ว
- ยังไม่พิมพ์ QR จำนวนมากจนกว่าจะยืนยัน URL production คงที่

## การอัปเดตโดยรักษา QR URL เดิม

1. หยุดหรือแจ้ง maintenance window สำหรับ mutation สำคัญ
2. สำรอง Sheet และรัน Integrity audit ก่อนเปลี่ยนรุ่น
3. อัปโหลด source รุ่นใหม่เข้า Apps Script project เดิมให้ครบ 43 runtime files และเทียบ inventory สองทาง ไฟล์ `.gs/.html` เก่าที่ถูกถอดจาก repository ต้องผ่าน review แล้วนำออกจาก project ด้วย เพราะไฟล์ `.gs` ที่ค้างยังเป็น global callable code ได้
4. อ่าน [MIGRATING.md](MIGRATING.md) แล้วรัน `setupSystem()` เพื่อใช้ additive migrations
5. ที่ **Deploy > Manage deployments** เลือก deployment production เดิม แล้วกด **Edit**
6. เลือก **New version**, ใส่ description ที่อ้าง source commit และกด Deploy
7. ตรวจว่า deployment ID และ `/exec` URL ไม่เปลี่ยน จากนั้นทำ smoke test User/Admin/QR

อย่าสร้าง deployment production ใหม่ทุก release เพราะ URL จะเปลี่ยนและ QR sticker เดิมจะชี้ผิดที่ Version ของ Apps Script เป็น snapshot ที่แก้ไม่ได้ แต่ deployment เดิมสามารถชี้ไป version ใหม่โดยรักษา URL/ID เดิม

### Rollback

หาก release ใหม่มีปัญหา ให้ **Manage deployments > Edit** deployment เดิมแล้วเลือก version ก่อนหน้า การ rollback นี้คืนเฉพาะ code/manifest ไม่ได้ย้อนข้อมูล, migration หรือ Script Properties ซึ่งเป็นค่าร่วมที่แก้ได้ตลอด ให้เทียบและคืน property set รุ่นก่อนจาก restricted config backup หลังตรวจ compatibility เท่านั้น เนื่องจาก migrations เป็น additive ต้องอ่าน `MIGRATING.md` ก่อน rollback และห้าม restore ด้วยการลบ History, Operations หรือ SchemaMigrations

## การดูแลหลังเปิดใช้งาน

### ทุกวันหรือเมื่อมี incident

- เปิด Apps Script **Executions** แล้วกรอง `Failed` และ `Timed out`
- ตรวจ structured `console.error`/Cloud Logging ตาม `code` และ `requestId` แม้ execution แสดง `Completed` เพราะ application errors ถูกจับและคืนเป็น safe result
- ให้ผู้ใช้ส่งข้อความ error พร้อม `requestId`, เวลาโดยประมาณ, action และ Asset/Borrow ID โดยไม่ส่งข้อมูลส่วนบุคคลเกินจำเป็น
- ตรวจ Admin Integrity audit และ Operations queue ก่อนแก้ Sheet
- ตรวจ Workspace Status Dashboard หากหลายรายการล้มพร้อมกัน

### ทุกสัปดาห์และก่อน release

- ทำสำเนา Google Sheet แบบจำกัดสิทธิ์และบันทึกวันเวลา/source version
- export Script Properties เป็น restricted configuration record ผ่านกระบวนการที่ไม่เขียนค่าจริงลง Git/issue/chat และทบทวนทุกครั้งก่อน release
- ตรวจผู้มีสิทธิ์ Editor ของ Sheet, folder และ Apps Script project
- ตรวจ account ผู้ deploy ว่ายัง Active และเข้าถึงทรัพยากรได้
- ตรวจ error rate, execution duration และ quota ใน Apps Script dashboard
- ตรวจสิทธิ์/พื้นที่ของไฟล์ภาพทั้งไฟล์ปัจจุบันและไฟล์ที่ถูกแทนที่ เพราะ policy ใหม่ไม่ย้อนแก้ไฟล์เก่าและ storage สามารถสะสมได้
- ทดสอบ DR เป็นระยะ: Sheet copy, property restore, Drive retention และขั้นตอน remap file ID ใน environment แยกก่อนอ้างว่าสามารถกู้คืนได้

สำเนา Sheet เก็บข้อมูลธุรกรรมและ file IDs แต่ไม่ได้สร้างสำเนารูปที่มี ID เดิม ควรใช้ retention/backup policy ของ Google Drive เพื่อรักษา folder ต้นฉบับ หาก copy รูปเป็นไฟล์ใหม่ ID จะเปลี่ยนและต้องมีแผน reconcile reference ก่อน restore

Google เปลี่ยน quota ได้โดยไม่แจ้งล่วงหน้า อย่าฝังค่า quota ปัจจุบันไว้เป็นสมมติฐานของระบบ ให้ตรวจหน้า quota ทางการและ execution health ก่อนเพิ่มปริมาณผู้ใช้

## ข้อห้ามในการดูแลข้อมูล

- ห้ามเปลี่ยนชื่อ/ลำดับ/ลบ header ของ Sheet
- ห้ามแก้ `Sequences`, `SchemaMigrations`, `Operations` หรือ `History` ด้วยมือ
- ห้ามลบ row ของ Equipment, Borrow, Users, Categories, IncludedItems หรือ BorrowItems; ใช้ lifecycle/status และ workflow ที่ระบบให้
- ห้ามแก้ Borrow/Equipment status แยกกัน เพราะสองตารางต้อง synchronize ภายใต้ Script Lock
- warning protection ที่ setup สร้างเป็นสัญญาณเตือน ไม่ใช่ access control; สิทธิ์ Share ของ Google Sheet คือ boundary จริง
- ห้ามเผยแพร่ Script Properties, Sheet ID, Drive folder ID, deployment ID หรือ URL ภายในใน issue/public repository

## Troubleshooting แบบย่อ

| อาการ/รหัส | ตรวจสอบและแก้ไข |
|---|---|
| `UNAUTHENTICATED` / ไม่พบอีเมล | ตรวจ account/browser profile, same-domain identity และ deployment access; หยุด rollout ถ้า Active User ยังว่าง |
| `FORBIDDEN` | เพิ่ม/เปิดใช้งาน Users row หรือ role ผ่าน Admin; อย่าแก้ role จาก browser/client |
| `CONFIG_ERROR` ที่ Sheet | ตรวจ `SPREADSHEET_ID` และสิทธิ์ผู้ deploy แล้วรัน setup |
| `CONFIG_ERROR` ที่ Drive | ตรวจ `DRIVE_FOLDER_ID`, folder ไม่อยู่ Trash และสิทธิ์ผู้ deploy |
| `DRIVE_SHARING_FAILED` | ตรวจ Workspace Drive sharing policy; อย่าเปลี่ยนเป็น public โดยไม่อนุมัติ |
| QR ไม่พร้อม | ตั้ง `WEB_APP_URL` เป็น HTTPS `/exec` URL ที่ไม่มี query/fragment แล้วรัน setup ซ้ำ |
| `OPERATION_PENDING` | ใช้หน้า Admin Operations เพื่อ reconcile exact command; ห้ามลบ/แก้ journal row |
| `ID_EXHAUSTED` | หยุดสร้าง record ชนิดนั้นและออกแบบ migration ของรูปแบบ ID; ห้ามเพิ่มเลขเอง |
| quota/timeout | ตรวจ Executions และ quota ทางการ ลด burst/retry หลังประเมิน operation state |
| UI ไม่มี style/font | ตรวจ firewall ให้ browser เข้าถึง `cdn.jsdelivr.net`, `fonts.googleapis.com` และ `fonts.gstatic.com` |
| รูปไม่แสดง | ตรวจ `drive.google.com`, file sharing mode และ resource key จากบัญชี User ปกติ |

## เอกสารทางการที่ใช้อ้างอิง

- [Deploy Apps Script as a web app](https://developers.google.com/apps-script/guides/web)
- [Session and Active User identity](https://developers.google.com/apps-script/reference/base/session)
- [Manage Script Properties](https://developers.google.com/apps-script/guides/properties)
- [Create and manage versioned deployments](https://developers.google.com/apps-script/concepts/deployments)
- [Apps Script authorization](https://developers.google.com/apps-script/guides/services/authorization)
- [Apps Script OAuth scopes](https://developers.google.com/apps-script/concepts/scopes)
- [Apps Script logging and execution errors](https://developers.google.com/apps-script/guides/logging)
- [Current Apps Script quotas and limits](https://developers.google.com/apps-script/guides/services/quotas)
