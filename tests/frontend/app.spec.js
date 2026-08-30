const { test, expect } = require('@playwright/test');

const ROUTE_SELECTORS = {
  dashboard: '#page-dashboard',
  equipment: '#page-equipment',
  'equipment-detail': '#page-equipment-detail',
  scan: '#page-scan',
  'my-borrow': '#page-my-borrow',
  admin: '#page-admin',
};

function routeUrl(route, extras = '') {
  const params = new URLSearchParams({ view: route, role: 'admin' });
  if (route === 'equipment-detail') params.set('id', 'AST-000001');
  if (extras) {
    new URLSearchParams(extras).forEach((value, key) => params.append(key, value));
  }
  return `/?${params.toString()}`;
}

async function waitForApplication(page, route) {
  await expect(page.locator('#app-splash')).toBeHidden();
  await expect(page.locator('#access-state')).toBeHidden();
  await expect(page.locator('#app-shell')).toBeVisible();
  await expect(page.locator(ROUTE_SELECTORS[route])).toBeVisible();
  await expect(page.locator('#global-loading')).toBeHidden();
}

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('bootstrap fails closed and keeps the admin route role-gated', async ({ page }) => {
  const pageErrors = collectPageErrors(page);

  await page.goto('/?view=dashboard&role=admin');
  await waitForApplication(page, 'dashboard');
  await expect(page.locator('#dashboard-content')).toBeVisible();
  await expect(page.locator('[data-session-name]').first()).toHaveText('ผู้ดูแลทดสอบ');
  await expect(page.locator('[data-route="admin"]').first()).toBeVisible();

  await page.goto('/?view=admin&role=user');
  await waitForApplication(page, 'dashboard');
  await expect(page.locator('#page-admin')).toHaveCount(0);
  await expect(page.locator('[data-admin-only]:visible')).toHaveCount(0);

  await page.goto('/?view=dashboard&access=disabled');
  await expect(page.locator('#app-splash')).toBeHidden();
  await expect(page.locator('#app-shell')).toBeHidden();
  await expect(page.locator('#access-state')).toBeVisible();
  await expect(page.locator('[data-access-title]')).toContainText('บัญชี');
  await expect(page.locator('[data-access-message]')).toContainText('ปิดใช้งาน');

  expect(pageErrors).toEqual([]);
});

test('equipment detail renders QR, downloads a sticker, copies its URL, and hands off exact Asset ID', async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.goto(routeUrl('equipment-detail'));
  await waitForApplication(page, 'equipment-detail');

  await expect(page.locator('#equipment-detail-content')).toBeVisible();
  await expect(page.locator('#equipment-detail-title')).toHaveText('Notebook Dell Latitude 5440');
  await expect(page.locator('#equipment-detail-asset-id')).toHaveText('AST-000001');
  await expect(page.locator('#equipment-qr-content canvas')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="download-qr"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('CRS-AST-000001-sticker.png');
  await expect(page.locator('.toast.show')).toContainText('ดาวน์โหลดสติกเกอร์ QR');

  await page.locator('[data-action="copy-equipment-link"]').click();
  await expect.poll(() => page.evaluate(() => window.__CRS_TEST__.clipboard)).toBe(
    'https://script.google.com/macros/s/crs-test/exec?view=equipment-detail&id=AST-000001',
  );

  await page.locator('[data-action="manage-asset-borrowing"]').click();
  await waitForApplication(page, 'admin');
  await expect(page.locator('#admin-borrow-results-summary')).toContainText('AST-000001');
  await expect.poll(() => page.evaluate(() => {
    const call = window.__CRS_TEST__.calls.find((entry) => entry.method === 'adminListBorrowing');
    return call && call.args[0] && call.args[0].assetId;
  })).toBe('AST-000001');

  expect(pageErrors).toEqual([]);
});

test('scanner provides local file validation and a safe manual Asset ID fallback', async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(routeUrl('scan'));
  await waitForApplication(page, 'scan');

  const input = page.locator('#scan-image-input');
  await expect(page.locator('#scan-image-label')).toBeVisible();
  await expect(input).toHaveAttribute('accept', /image\/png/);
  await expect(input).toHaveAttribute('capture', 'environment');
  await input.setInputFiles({ name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.locator('#scan-error')).toBeVisible();
  await expect(page.locator('#scan-error')).toContainText('PNG, JPEG หรือ WebP');

  await page.locator('#asset-id-entry').fill('AST-123');
  await page.locator('#asset-id-entry-form button[type="submit"]').click();
  await expect(page.locator('#scan-error')).toContainText('AST-000001');

  await page.locator('#asset-id-entry').fill('ast-000001');
  await page.locator('#asset-id-entry-form button[type="submit"]').click();
  await waitForApplication(page, 'equipment-detail');
  await expect(page.locator('#equipment-detail-asset-id')).toHaveText('AST-000001');

  expect(pageErrors).toEqual([]);
});

test('admin borrowing action requires its explicit modal and sends the current version', async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(routeUrl('admin'));
  await waitForApplication(page, 'admin');
  await expect(page.locator('#table-body-admin-borrow')).toContainText('BR-000001');

  await page.locator('[data-borrow-action="approve"][data-borrow-id="BR-000001"]').click();
  const modal = page.locator('#modal-admin-approve');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-labelledby', 'admin-approve-title');
  await expect(modal.locator('#admin-approve-summary')).toContainText('AST-000001');
  await modal.locator('[data-action="submit-admin-approve"]').click();
  await expect(modal).toBeHidden();

  await expect.poll(() => page.evaluate(() => {
    const call = window.__CRS_TEST__.calls.find((entry) => entry.method === 'adminApproveBorrow');
    return call && call.args[0];
  })).toMatchObject({ borrow_id: 'BR-000001', expected_version: 1 });
  await expect(page.locator('.toast.show')).toContainText('อนุมัติคำขอ');

  expect(pageErrors).toEqual([]);
});

test('dashboard, catalog, detail, scanner, borrowing, and admin remain contained at 320/768/1440px', async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  const viewports = [
    { width: 320, height: 740 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 },
  ];
  const routes = ['dashboard', 'equipment', 'equipment-detail', 'scan', 'my-borrow', 'admin'];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(routeUrl(route));
      await waitForApplication(page, route);
      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        main: document.querySelector('#app-main').scrollWidth,
        mainClient: document.querySelector('#app-main').clientWidth,
        offenders: Array.from(document.querySelectorAll('body *')).map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            node: `${element.tagName.toLowerCase()}#${element.id}.${element.className}`,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        }).filter((entry) => entry.left < -1 || entry.right > window.innerWidth + 1)
          .sort((left, right) => right.right - left.right).slice(0, 8),
      }));
      expect(layout.document,
        `${route} at ${viewport.width}px overflows the document: ${JSON.stringify(layout.offenders)}`)
        .toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.main, `${route} at ${viewport.width}px overflows the main region`).toBeLessThanOrEqual(layout.mainClient + 1);
      await expect(page.locator(`${ROUTE_SELECTORS[route]} h1`).first()).toBeVisible();
    }

    if (viewport.width < 992) {
      await expect(page.locator('#mobile-nav')).toBeVisible();
      await expect(page.locator('#desktop-sidebar')).toBeHidden();
    } else {
      await expect(page.locator('#mobile-nav')).toBeHidden();
      await expect(page.locator('#desktop-sidebar')).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(routeUrl('admin'));
  await waitForApplication(page, 'admin');
  const tabDimensions = await page.locator('.admin-tabs-scroll').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(tabDimensions.scrollWidth).toBeGreaterThan(tabDimensions.clientWidth);
  expect(['auto', 'scroll']).toContain(tabDimensions.overflowX);

  expect(pageErrors).toEqual([]);
});

test('RPC failures surface Thai feedback without leaving a loading state', async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.goto('/?view=equipment&role=admin&fail=listEquipment');
  await waitForApplication(page, 'equipment');
  await expect(page.locator('#equipment-loading')).toBeHidden();
  await expect(page.locator('#equipment-error')).toBeVisible();
  await expect(page.locator('#equipment-error')).toContainText('จำลองข้อผิดพลาด');
  await expect(page.locator('#view-root')).toHaveAttribute('aria-busy', 'false');
  expect(pageErrors).toEqual([]);
});
