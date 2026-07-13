import { test, expect } from "@playwright/test";

test.describe("staff login", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /SpecDriven/i })).toBeVisible();
    await expect(page.getByLabel(/e-mail/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
  });

  test("forgot password link navigates", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /esqueci/i }).click();
    await expect(page).toHaveURL(/forgot-password/);
  });
});
