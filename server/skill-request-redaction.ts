import { createHash } from "node:crypto";
import { redactSecretsInText } from "./redact.ts";
import type { SkillRequestCardData } from "../shared/skill-request.ts";

export function redactSkillRequest(request: SkillRequestCardData): SkillRequestCardData {
      const originalPreview = request.preview;
      const preview = originalPreview === undefined
        ? undefined
        : redactSecretsInText(originalPreview);
      // Keep the digest only when this pass changed nothing and it matches the preview, so a card never shows one SKILL.md and approves another.
      const previewSha256 = preview !== undefined && preview === originalPreview
        ? createHash("sha256").update(preview).digest("hex")
        : undefined;
      // Reference files ride the same binding: any scrub change makes the
      // whole card deny-only.
      const originalReferences = request.references;
      const references = originalReferences?.map((file) => ({
        path: redactSecretsInText(file.path),
        content: redactSecretsInText(file.content),
      }));
      const referencesUnchanged = (references ?? []).every((file, index) =>
        file.path === originalReferences![index]!.path && file.content === originalReferences![index]!.content);
      const sha256 = request.sha256 !== undefined
        && request.sha256 === previewSha256
        && referencesUnchanged
        ? request.sha256
        : undefined;
      return {
        ...request,
        gist: redactSecretsInText(request.gist),
        source: request.source === undefined
          ? undefined
          : redactSecretsInText(request.source),
        preview,
        sha256,
        ...(references ? { references } : {}),
        warnings: request.warnings.map((warning) => redactSecretsInText(warning)),
      };
}
