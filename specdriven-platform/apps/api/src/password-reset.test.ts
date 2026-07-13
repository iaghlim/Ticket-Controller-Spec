import { describe, expect, it } from "vitest";
import {
  signPasswordResetToken,
  verifyPasswordResetToken,
} from "./password-reset.js";

describe("password-reset", () => {
  it("signs and verifies reset token", () => {
    const token = signPasswordResetToken("user-123");
    expect(verifyPasswordResetToken(token)).toBe("user-123");
  });

  it("rejects tampered token", () => {
    const token = signPasswordResetToken("user-123");
    expect(verifyPasswordResetToken(`${token}x`)).toBeNull();
  });
});
