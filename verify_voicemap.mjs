import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SHOTS = 'c:\\Nirat_Voice_Map\\screenshots';
try { mkdirSync(SHOTS, { recursive: true }); } catch {}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  geolocation: { latitude: 13.7563, longitude: 100.5018 },
  permissions: ['geolocation'],
  viewport: { width: 1280, height: 800 }
});

const page = await context.newPage();

const jsErrors = [];
page.on('console', msg => { if (msg.type() === 'error') jsErrors.push(msg.text()); });
page.on('pageerror', err => jsErrors.push('PAGE ERR: ' + err.message));

// STEP 1 — Load index.html
console.log('=== STEP 1: index.html ===');
await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('.leaflet-container', { timeout: 10000 });
const mapOk = await page.isVisible('.leaflet-container');
console.log('Map visible:', mapOk);
await page.waitForTimeout(2000);
const tiles = await page.locator('.leaflet-tile').count();
console.log('Tiles rendered:', tiles);
await page.screenshot({ path: SHOTS + '\\01_index.png' });

// STEP 2 — UI elements
const logo = await page.locator('.app-logo-text').textContent();
console.log('Logo:', logo);
const statusTxt = await page.locator('#statusText').textContent();
console.log('Status text:', statusTxt);
const panelVisible = await page.isVisible('#bottomPanel');
console.log('Bottom panel exists:', panelVisible);
const fabHref = await page.locator('.fab').getAttribute('href');
console.log('FAB href:', fabHref);

// STEP 3 — Panel toggle
await page.click('#panelHandle');
await page.waitForTimeout(500);
const expanded = await page.locator('#bottomPanel').evaluate(el => el.classList.contains('expanded'));
console.log('Panel expands on handle click:', expanded);
await page.screenshot({ path: SHOTS + '\\02_panel.png' });
await page.click('#panelHandle');

// STEP 4 — Navigate to admin
console.log('\n=== STEP 4: admin.html ===');
await page.click('.fab');
await page.waitForURL('**/admin.html', { timeout: 8000 });
console.log('URL after FAB click:', page.url());
await page.waitForTimeout(800);
await page.screenshot({ path: SHOTS + '\\03_admin.png' });

// STEP 5 — Login form
const loginVisible = await page.isVisible('#loginScreen');
console.log('Login screen visible:', loginVisible);
const pwVisible = await page.isVisible('#pwInput');
console.log('Password input visible:', pwVisible);
const loginTitle = await page.locator('.login-title').textContent();
console.log('Login title:', loginTitle);

// STEP 6 — Wrong password
console.log('\n=== STEP 6: Wrong password ===');
await page.fill('#pwInput', 'wrongpass');
await page.click('button[type="submit"]');
await page.waitForTimeout(400);
const errMsg = await page.locator('#loginErr').textContent();
console.log('Error message shown:', errMsg);

// STEP 7 — Correct password
console.log('\n=== STEP 7: Correct password ===');
await page.fill('#pwInput', 'admin1234');
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
const adminVisible = await page.isVisible('#adminLayout');
console.log('Admin layout visible:', adminVisible);
// Wait for Leaflet to initialise inside the now-visible container
await page.waitForSelector('#adminMap .leaflet-container', { timeout: 8000 }).catch(() => null);
const adminMapEl = await page.locator('#adminMap .leaflet-container').count();
console.log('Admin Leaflet map rendered:', adminMapEl > 0);
await page.screenshot({ path: SHOTS + '\\04_admin_dash.png' });

// STEP 8 — Add pin button
console.log('\n=== STEP 8: Add pin flow ===');
const addBtn = await page.isVisible('#addPinBtn');
console.log('Add Pin button visible:', addBtn);
await page.click('#addPinBtn');
await page.waitForTimeout(400);
const hintOn = await page.isVisible('#addHint');
console.log('Add hint shown after clicking Add Pin:', hintOn);

// Click on map to trigger modal
await page.locator('#adminMap').click({ position: { x: 400, y: 300 } });
await page.waitForTimeout(800);
const modalVisible = await page.isVisible('#editModal');
console.log('Edit modal opens after map click:', modalVisible);

if (modalVisible) {
  const recBtn = await page.isVisible('#recBtn');
  console.log('Record button visible in modal:', recBtn);
  const pinNameVisible = await page.isVisible('#pinName');
  console.log('Pin name input visible:', pinNameVisible);
  const latVisible = await page.isVisible('#pinLat');
  const latVal = await page.locator('#pinLat').inputValue();
  console.log('Lat auto-filled:', latVal !== '');
  await page.screenshot({ path: SHOTS + '\\05_edit_modal.png' });
  await page.click('#cancelBtn');
  await page.waitForTimeout(300);
  const modalClosed = !(await page.locator('#editModal').evaluate(el => el.classList.contains('show')));
  console.log('Modal closes on cancel:', modalClosed);
}

// STEP 9 — Cancel add hint
await page.click('#addPinBtn');
await page.waitForTimeout(300);
await page.click('#cancelAddBtn');
await page.waitForTimeout(300);
const hintOff = await page.locator('#addHint').evaluate(el => el.style.display === 'none' || !el.offsetParent);
console.log('Add hint dismisses on cancel:', hintOff);

// STEP 10 — Go back to index, check audio notification hidden
console.log('\n=== STEP 10: Audio notification element ===');
await page.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);
const notifCount = await page.locator('#audioNotif').count();
console.log('Audio notif element exists:', notifCount > 0);
const notifHidden = await page.locator('#audioNotif').evaluate(el => !el.classList.contains('show'));
console.log('Notification starts hidden:', notifHidden);

// Check nav panel elements hidden by default
const navPanelHidden = await page.locator('#panelNav').evaluate(el => el.style.display === 'none');
console.log('Nav panel hidden by default:', navPanelHidden);

await page.screenshot({ path: SHOTS + '\\06_index_final.png' });

// Summary
console.log('\n=== JS CONSOLE ERRORS ===');
if (jsErrors.length === 0) {
  console.log('NO JS ERRORS');
} else {
  console.log('ERRORS:');
  jsErrors.forEach(e => console.log('  ' + e));
}

console.log('\nScreenshots saved to:', SHOTS);
await browser.close();
