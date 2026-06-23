import { mkdirSync } from "node:fs";
import path from "node:path";

export class ProfileManager {
  constructor(private readonly profilesRoot: string) {}

  getProfilePath(platformId: string, accountId: string): string {
    return path.join(
      this.profilesRoot,
      this.slug(platformId),
      this.slug(accountId),
      "user-data"
    );
  }

  ensureProfilePath(platformId: string, accountId: string): string {
    const profilePath = this.getProfilePath(platformId, accountId);
    mkdirSync(profilePath, { recursive: true });
    return profilePath;
  }

  private slug(value: string): string {
    const slug = value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "-")
      .replace(/_/g, "-")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || "item";
  }
}
