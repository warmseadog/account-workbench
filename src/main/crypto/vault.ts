import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { EncryptedSecret } from "../../shared/models.js";

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const SALT_LENGTH_BYTES = 16;

export class CryptoVault {
  private constructor(private readonly masterPassword: string) {}

  static fromMasterPassword(masterPassword: string): CryptoVault {
    if (masterPassword.trim().length < 8) {
      throw new Error("Master password must be at least 8 characters.");
    }

    return new CryptoVault(masterPassword);
  }

  encryptSecret(secret: string): EncryptedSecret {
    const salt = randomBytes(SALT_LENGTH_BYTES);
    const iv = randomBytes(IV_LENGTH_BYTES);
    const key = this.deriveKey(salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 1,
      algorithm: "aes-256-gcm",
      kdf: "scrypt",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64")
    };
  }

  decryptSecret(envelope: EncryptedSecret): string {
    try {
      this.assertSupportedEnvelope(envelope);
      const salt = Buffer.from(envelope.salt, "base64");
      const iv = Buffer.from(envelope.iv, "base64");
      const key = this.deriveKey(salt);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final()
      ]);

      return plaintext.toString("utf8");
    } catch (error) {
      throw new Error("Unable to decrypt secret with the supplied master password.", {
        cause: error
      });
    }
  }

  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.masterPassword, salt, KEY_LENGTH_BYTES);
  }

  private assertSupportedEnvelope(envelope: EncryptedSecret): void {
    if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm" || envelope.kdf !== "scrypt") {
      throw new Error("Unsupported encrypted secret envelope.");
    }
  }
}
