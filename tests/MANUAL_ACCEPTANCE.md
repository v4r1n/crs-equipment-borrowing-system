# Deployment Acceptance Matrix

Automated local acceptance runs with `npm run test`. The following checks intentionally require the deployer's Google Workspace resources, accounts, browsers, and physical devices and must be completed against the Phase 7 `/exec` deployment.

Repository handoff status: **NOT RUN on organization resources**. A deployer must record the source commit, Apps Script version/deployment ID, masked `/exec` reference, Workspace domain, tester, date, result, browser/device, and restricted evidence in the organization's change record. Do not paste real Sheet/Folder IDs or internal URLs into this repository.

| Area | Deployer check | Expected evidence |
|---|---|---|
| Configuration | Verify `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, exact one-domain `ALLOWED_DOMAIN`, primary-email `ADMIN_EMAILS`, `IMAGE_SHARING=DOMAIN_WITH_LINK`, `AUTO_PROVISION_USERS=false`, and exact current `/exec` `WEB_APP_URL` | Script Properties match the approved environment; manifest shows only Drive, Sheets, and `userinfo.email` scopes; no ID/email was committed to source |
| Setup | Run `setupSystem()` on a new Sheet, then run it again | Eleven managed sheets are correctly headed/protected while unrelated tabs remain untouched; seed counts do not duplicate; three migration records remain |
| Identity | Open `/exec` as an active User, active Admin, unknown same-domain user, inactive user, external-domain user, and signed-out visitor | User/Admin receive only permitted UI/data; unknown/inactive same-domain accounts get a Thai app error and request ID; Google denies external/signed-out access before the app and exposes no app data |
| Authorization | Invoke an Admin screen/action while signed in as a normal User | Server returns `FORBIDDEN`; no Sheet, Drive, History, or Operations row changes |
| Resource ACL | Audit direct and inherited sharing for the Sheet, image folder, and Apps Script project | Ordinary users have no Sheet/folder role through person/group/link; only approved release operators can edit the script/properties |
| Borrowing | User requests an Available asset while another account attempts the same asset | First request creates one Pending hold; competing request is rejected; Borrow and Equipment stay synchronized |
| Lifecycle | Admin approves and checks out; borrower requests return; Admin checks every included item and completes return | Status sequence and row versions are correct; Equipment clears `active_borrow_id`; exactly one History entry exists per command |
| Overdue | Check a checked-out loan on its due date and the following Bangkok business date | Due date is not overdue; following date is shown as Overdue without replacing the stored workflow status |
| Drive image | Upload and replace an equipment image, then test its direct URL as active/unknown same-domain, external-domain, and signed-out accounts | Same-domain link holders can view under the accepted classification boundary; external/signed-out are denied; resource key is retained; uncertain retry does not duplicate the domain mutation |
| QR sticker | Download, print, and scan a sticker for an asset | PNG is crisp with quiet zone; scan opens the exact Equipment Detail record and never performs a mutation |
| Mobile capture | On supported Android and iOS browsers, choose the scanner capture control and photograph a valid/invalid QR | Native camera/file picker opens where supported; valid QR navigates internally; invalid image shows Thai feedback; manual Asset ID always remains usable |
| Responsive and keyboard | Exercise User and Admin routes on supported desktop/tablet/mobile browsers, including 320px width | No document-level horizontal overflow; tables/tabs scroll locally; mobile bottom navigation and central Scan action remain reachable; focus and dialogs are operable by keyboard |
| Integrity | Run the Admin integrity audit after the workflow | No errors for healthy data; any warning/error includes a sheet, record reference, and actionable message |
| Observability | Cause a safe validation failure and inspect Apps Script logs | Structured error with code/request ID is searchable even when the execution status is `Completed`; Failed/Timed out filters are also monitored |
| Deployment continuity | Publish a new version using the existing deployment rather than creating a new public URL | Existing printed QR URLs continue to resolve to the same `/exec` application path |
| Recovery | Restore a restricted test backup of Sheet/config and exercise the documented image-ID reconciliation in a separate environment | Operator can explain code-versus-property rollback boundaries; no production History/Operations/Migrations are deleted or overwritten |

Every row must be marked PASS before go-live. A failure in Identity, Authorization, data integrity, Drive sharing, or deployment continuity blocks rollout; do not weaken access settings to obtain a pass. Follow [DEPLOYMENT.md](../docs/DEPLOYMENT.md) for remediation and rollback.
