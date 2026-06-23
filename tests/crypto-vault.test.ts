import { describe, expect, it } from "vitest";
import { CryptoVault } from "../src/main/crypto/vault";

describe("CryptoVault", () => {
  it("encrypts credentials without storing plaintext in the envelope", () => {
    const vault = CryptoVault.fromMasterPassword("correct horse battery staple");

    const envelope = vault.encryptSecret("secret-password");

    expect(JSON.stringify(envelope)).not.toContain("secret-password");
    expect(vault.decryptSecret(envelope)).toBe("secret-password");
  });

  it("rejects decryption with the wrong master password", () => {
    const vault = CryptoVault.fromMasterPassword("right-password");
    const wrongVault = CryptoVault.fromMasterPassword("wrong-password");
    const envelope = vault.encryptSecret("secret-password");

    expect(() => wrongVault.decryptSecret(envelope)).toThrow(/decrypt/i);
  });
});
