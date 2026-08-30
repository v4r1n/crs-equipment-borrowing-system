# Deployment Acceptance Matrix

Automated local acceptance runs with `npm run test`. The following checks intentionally require the deployer's Google Workspace resources, accounts, browsers, and physical devices and must be completed against the Phase 7 `/exec` deployment.

| Area | Deployer check | Expected evidence |
|---|---|---|
| Setup | Run `setupSystem()` on a new Sheet, then run it again | Eleven correctly headed/protected sheets; seed counts do not duplicate; three migration records remain |
| Identity | Open `/exec` as an active User, active Admin, unknown same-domain user, inactive user, external-domain user, and signed-out visitor | User/Admin receive only their permitted UI/data; all other identities fail closed with a Thai message and request ID |
| Authorization | Invoke an Admin screen/action while signed in as a normal User | Server returns `FORBIDDEN`; no Sheet, Drive, History, or Operations row changes |
| Borrowing | User requests an Available asset while another account attempts the same asset | First request creates one Pending hold; competing request is rejected; Borrow and Equipment stay synchronized |
| Lifecycle | Admin approves and checks out; borrower requests return; Admin checks every included item and completes return | Status sequence and row versions are correct; Equipment clears `active_borrow_id`; exactly one History entry exists per command |
| Overdue | Check a checked-out loan on its due date and the following Bangkok business date | Due date is not overdue; following date is shown as Overdue without replacing the stored workflow status |
| Drive image | Upload and replace an equipment image from the Admin UI | Allowed users can display the image; resource key is retained when required; uncertain retry does not create duplicate domain mutation |
| QR sticker | Download, print, and scan a sticker for an asset | PNG is crisp with quiet zone; scan opens the exact Equipment Detail record and never performs a mutation |
| Mobile capture | On supported Android and iOS browsers, choose the scanner capture control and photograph a valid/invalid QR | Native camera/file picker opens where supported; valid QR navigates internally; invalid image shows Thai feedback; manual Asset ID always remains usable |
| Responsive and keyboard | Exercise User and Admin routes on supported desktop/tablet/mobile browsers, including 320px width | No document-level horizontal overflow; tables/tabs scroll locally; mobile bottom navigation and central Scan action remain reachable; focus and dialogs are operable by keyboard |
| Integrity | Run the Admin integrity audit after the workflow | No errors for healthy data; any warning/error includes a sheet, record reference, and actionable message |
| Deployment continuity | Publish a new version using the existing deployment rather than creating a new public URL | Existing printed QR URLs continue to resolve to the same `/exec` application path |
