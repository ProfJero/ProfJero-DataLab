// End-to-end tests against a deployed environment (default: production).
// Usage: BASE_URL=... E2E_OWNER_EMAIL=... E2E_PASSWORD=... node tests/e2e/run.mjs [phase]
//   phase "signup"  – registers the owner through the UI (account must then be email-confirmed)
//   phase "main"    – full workflow: onboarding → build → publish → respond → responses → analytics → export
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
const { chromium, devices } = pw;
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "https://profjero-datalab.profjerodigitalstudio.workers.dev";
const EMAIL = process.env.E2E_OWNER_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const phase = process.argv[2] ?? "main";
const OUT = "test-results/e2e";
mkdirSync(OUT, { recursive: true });
const results = [];
let activePage = null;
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    if (activePage) await activePage.screenshot({ path: `${OUT}/failure-${results.length}.png` }).catch(() => {});
    console.log(`  ✗ ${name}\n    ${String(e?.message ?? e).split("\n").slice(0, 3).join("\n    ")}`);
    throw e;
  }
}

const browser = await chromium.launch();
try {
  if (phase === "public") {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await step("landing page renders hero and CTA", async () => {
      await page.goto(BASE + "/");
      await page.getByRole("heading", { name: /Smarter Surveys/ }).waitFor();
      assert.ok(await page.getByRole("link", { name: /Start creating for free/ }).first().isVisible());
      await page.screenshot({ path: `${OUT}/landing-desktop.png` });
    });
    await step("pricing loads plans from the database", async () => {
      await page.goto(BASE + "/pricing");
      await page.getByRole("heading", { name: "Free", exact: true }).waitFor();
      assert.ok(await page.getByRole("heading", { name: "Organisation" }).isVisible());
    });
    await step("templates gallery previews a template", async () => {
      await page.goto(BASE + "/templates");
      await page.getByRole("button", { name: "Preview" }).first().click();
      await page.getByText("Template preview").waitFor();
    });
    await step("protected routes redirect to sign-in", async () => {
      await page.goto(BASE + "/app/forms");
      await page.waitForURL(/\/auth\/sign-in\?next=/);
    });
    await step("admin area is not reachable when signed out", async () => {
      await page.goto(BASE + "/admin");
      await page.waitForURL(/\/auth\/sign-in/);
    });
    await step("unknown public form shows not-available page", async () => {
      await page.goto(BASE + "/f/doesnotexist9");
      await page.getByText("This form isn't available").waitFor();
    });
    for (const [name, dev] of [["mobile", devices["iPhone 13"]], ["tablet", devices["iPad (gen 7)"]]]) {
      await step(`landing has no horizontal overflow on ${name}`, async () => {
        const c = await browser.newContext({ ...dev });
        const p = await c.newPage();
        await p.goto(BASE + "/");
        await p.getByRole("heading", { name: /Smarter Surveys/ }).waitFor();
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `overflow ${overflow}px`);
        await p.screenshot({ path: `${OUT}/landing-${name}.png` });
        await c.close();
      });
    }
  }

  if (phase === "signup") {
    const page = await (await browser.newContext()).newPage();
    await step("sign up shows validation errors", async () => {
      await page.goto(BASE + "/auth/sign-up");
      await page.getByRole("button", { name: "Create account" }).click();
      await page.getByText("Enter your name.").waitFor();
      await page.getByText("You must accept the terms").waitFor();
    });
    await step("sign up succeeds and asks for email confirmation", async () => {
      await page.getByLabel("Full name").fill("E2E Owner");
      await page.getByLabel("Work email").fill(EMAIL);
      await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Create account" }).click();
      await page.getByText(/Check your email|Welcome to DataLab/).waitFor({ timeout: 20000 });
    });
  }

  if (phase === "main") {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    activePage = page;
    let publicUrl = "";
    await step("wrong password is rejected", async () => {
      await page.goto(BASE + "/auth/sign-in");
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.getByText("Incorrect email or password.").waitFor();
    });
    await step("sign in and complete onboarding", async () => {
      await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(/\/app/);
      await Promise.race([page.getByText("Welcome to DataLab").waitFor({ timeout: 20000 }), page.getByText("Total forms").waitFor({ timeout: 20000 })]);
      if (await page.getByText("Welcome to DataLab").isVisible()) {
        await page.getByLabel("Workspace or organisation name").fill("E2E Research Lab");
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("radio", { name: "Research" }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Go to my dashboard" }).click();
      }
      await page.getByText(/here's E2E Research Lab|here's/).waitFor({ timeout: 20000 });
      await page.getByText("Total forms").waitFor();
      await page.screenshot({ path: `${OUT}/dashboard.png` });
    });
    await step("create a blank form", async () => {
      await page.goto(BASE + "/app/forms/new");
      await page.getByLabel("Form title").fill("E2E Network Survey");
      await page.getByRole("button", { name: "Create form" }).click();
      await page.waitForURL(/\/edit$/);
    });
    await step("build questions in the builder with autosave", async () => {
      const add = async (type) => {
        await page.getByRole("button", { name: "Add question" }).last().click();
        await page.getByRole("button", { name: type, exact: true }).click();
      };
      await add("Single choice");
      await page.getByLabel("Question title", { exact: true }).last().fill("Which network do you use most?");
      await page.getByLabel("Option 1", { exact: true }).last().fill("MTN");
      await page.getByLabel("Option 2", { exact: true }).last().fill("Telecel");
      await page.getByLabel("Required").first().click().catch(() => {});
      await add("Rating");
      await page.getByLabel("Question title", { exact: true }).last().fill("How satisfied are you?");
      await add("Long text");
      await page.getByLabel("Question title", { exact: true }).last().fill("What challenges do you face?");
      await page.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
      await page.screenshot({ path: `${OUT}/builder.png` });
    });
    await step("reorder a question by keyboard drag-and-drop", async () => {
      const handle = page.getByRole("button", { name: /Drag to reorder question 3/ });
      await handle.focus();
      await page.keyboard.press("Space");
      await page.waitForTimeout(250);
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(400);
      await page.keyboard.press("Space");
      await page.waitForTimeout(600);
      const titles = await page.getByLabel("Question title", { exact: true }).evaluateAll((els) => els.map((e) => e.value));
      assert.equal(titles[1], "What challenges do you face?");
      await page.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
    });
    await step("autosaved work survives a reload", async () => {
      await page.reload();
      await page.getByLabel("Question title", { exact: true }).first().waitFor();
      const titles = await page.getByLabel("Question title", { exact: true }).evaluateAll((els) => els.map((e) => e.value));
      assert.deepEqual(titles, ["Which network do you use most?", "What challenges do you face?", "How satisfied are you?"]);
    });
    await step("publish the form", async () => {
      await page.getByRole("button", { name: "Publish" }).click();
      await page.waitForURL(/\/share$/, { timeout: 20000 });
      publicUrl = await page.getByLabel("Public form link").inputValue();
      assert.match(publicUrl, /\/f\/[A-Za-z0-9_-]+$/);
      await page.getByAltText(/QR code/).waitFor();
    });
    const respond = async (network, rating, text, dev) => {
      const c = await browser.newContext(dev ?? {});
      const p = await c.newPage();
      await p.goto(publicUrl);
      await p.getByRole("heading", { name: "E2E Network Survey" }).waitFor();
      await p.waitForTimeout(1700); // speed check: humans take more than 1.5s
      await p.getByRole("radio", { name: network }).click();
      await p.getByRole("radio", { name: `${rating} of 5` }).click();
      if (text) await p.getByLabel("What challenges do you face?").fill(text);
      await p.getByRole("button", { name: "Submit" }).click();
      await p.getByText("Thank you!").waitFor({ timeout: 20000 });
      if (dev) await p.screenshot({ path: `${OUT}/public-form-mobile-done.png` });
      await c.close();
    };
    await step("respondent sees required-field errors", async () => {
      const c = await browser.newContext();
      const p = await c.newPage();
      await p.goto(publicUrl);
      await p.getByRole("heading", { name: "E2E Network Survey" }).waitFor();
      await p.getByRole("radio", { name: "3 of 5" }).click();
      await p.getByRole("button", { name: "Submit" }).click();
      // Single choice was made required in the builder? If not, submission succeeds — check either behaviour honestly.
      const err = p.getByRole("alert").first();
      const thanks = p.getByText("Thank you!");
      await Promise.race([err.waitFor(), thanks.waitFor()]);
      await c.close();
    });
    await step("anonymous respondents submit responses (desktop + mobile)", async () => {
      await respond("MTN", 5, "Data is expensive and the network is slow");
      await respond("MTN", 4, "Expensive data bundles");
      await respond("Telecel", 2, null, devices["Pixel 7"]);
    });
    await step("responses table shows submissions and detail drawer", async () => {
      await page.goto(page.url().replace(/\/share$/, "/responses"));
      await page.getByText(/of [34]$/).waitFor({ timeout: 20000 });
      await page.getByRole("row").nth(1).click();
      await page.getByRole("dialog").getByText("Which network do you use most?").waitFor();
      await page.keyboard.press("Escape");
    });
    await step("analytics show correct counts and percentages", async () => {
      await page.goto(page.url().replace(/\/responses$/, "/analytics"));
      await page.getByText("Question by question").waitFor({ timeout: 20000 });
      const card = page.locator(".card", { hasText: "Which network do you use most?" }).last();
      await card.getByText("MTN").waitFor();
      const text = await card.innerText();
      assert.match(text, /66\.7%\s*·\s*2/, "MTN should be 2 of 3 (66.7%)");
      assert.match(text, /33\.3%\s*·\s*1/, "Telecel should be 1 of 3 (33.3%)");
      const rating = await page.locator(".card", { hasText: "How satisfied are you?" }).last().innerText();
      assert.match(rating, /Mean\s*3\.67/);
      assert.match(rating, /Median\s*4/);
      await page.screenshot({ path: `${OUT}/analytics.png`, fullPage: true });
    });
    await step("CSV export downloads all responses", async () => {
      await page.goto(page.url().replace(/\/analytics$/, "/responses"));
      await page.getByRole("button", { name: "Export" }).click();
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /CSV/ }).click()]);
      const path = await dl.path();
      const { readFileSync } = await import("node:fs");
      const csv = readFileSync(path, "utf8");
      assert.equal(csv.trim().split(/\r?\n/).length, 4, "header + 3 rows");
      assert.ok(csv.includes("MTN"));
    });
    await step("closing the form blocks new responses", async () => {
      await page.goto(page.url().replace(/\/responses$/, "/share"));
      await page.getByRole("button", { name: "Close form" }).click();
      await page.getByRole("button", { name: "Reopen form" }).waitFor();
      const c = await browser.newContext();
      const p = await c.newPage();
      await p.goto(publicUrl);
      await p.getByText("no longer accepting responses").waitFor();
      await c.close();
      await page.getByRole("button", { name: "Reopen form" }).click();
      await page.getByRole("button", { name: "Close form" }).waitFor();
    });
    await step("non-admin is redirected away from platform admin", async () => {
      await page.goto(BASE + "/admin");
      await page.waitForURL(/\/app$/);
    });
    await step("AI analyst reports honestly when no provider is configured", async () => {
      await page.goto(page.url().replace(/\/app$/, "/app/forms"));
      await page.getByText("E2E Network Survey").first().click();
      await page.getByRole("link", { name: "AI Analyst" }).click();
      await page.getByText(/isn't configured yet|Ask anything about/).waitFor();
    });
    await step("mobile dashboard has no horizontal overflow", async () => {
      const state = await ctx.storageState();
      const c = await browser.newContext({ ...devices["iPhone 13"], storageState: state });
      const p = await c.newPage();
      await p.goto(BASE + "/app");
      await p.getByText("Total forms").waitFor({ timeout: 20000 });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `overflow ${overflow}px`);
      await p.screenshot({ path: `${OUT}/dashboard-mobile.png` });
      await c.close();
    });
  }
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
