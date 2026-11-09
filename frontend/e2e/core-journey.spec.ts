import { test, expect, request as pwRequest } from '@playwright/test';

// The one journey every change must keep working: an author types prose into a scene,
// it auto-saves, and after a reload the prose is still there. Setup goes through the API
// (fast, stable); only the author's actions go through the browser.

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:8700';
const EMAIL = process.env.E2E_EMAIL ?? 'e2e@writerverse.local';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-pass-123';

test('prose typed into a scene survives a reload', async ({ page }) => {
  // --- setup via the API: log in, create a project, give it an outline with one scene
  const api = await pwRequest.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login/', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.ok(), 'login').toBeTruthy();
  const { access, refresh, user } = await login.json();
  const auth = { Authorization: `Bearer ${access}` };

  const created = await api.post('/api/projects/', { headers: auth, data: { title: `E2E ${Date.now()}` } });
  expect(created.ok(), 'create project').toBeTruthy();
  const project = await created.json();

  const outline = await api.post(`/api/consistency/projects/${project.id}/op/init_grand_outline/`, {
    headers: auth,
    data: { acts: ['Act 1'] }, // seeds one chapter with one empty scene
  });
  expect(outline.ok(), 'init outline').toBeTruthy();

  // --- log the browser in without the login screen (same shape authStore persists)
  await page.goto('/');
  await page.evaluate(
    ({ user, access, refresh }) =>
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user, tokens: { access, refresh }, isAuthenticated: true }, version: 0 }),
      ),
    { user, access, refresh },
  );

  // --- the author's journey
  const sentence = `The lighthouse keeper counted ${Date.now()} waves before dawn.`;
  await page.goto(`/project/${project.id}/chapters`);
  const editor = page.locator('.ProseMirror').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();

  const saved = page.waitForResponse(
    (r) => r.url().includes('/op/save_scene_content/') && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.keyboard.type(sentence);
  const saveResponse = await saved; // auto-save fires ~1.5s after typing stops
  expect(saveResponse.ok(), 'save_scene_content').toBeTruthy();

  await page.reload();
  await expect(page.locator('.ProseMirror').first()).toContainText(sentence, { timeout: 20_000 });
});
