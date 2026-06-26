import type { RequirementAttachment, RequirementAttachmentVersion } from "@/lib/tams-data";

export type RequirementUploadContext = {
  applicationId: string;
  templateId: string;
  uploaderName: string;
  previousAttachment?: RequirementAttachment;
};

export type RequirementUploadAdapter = {
  uploadRequirementFile: (file: File, context: RequirementUploadContext) => Promise<RequirementAttachment>;
  removeRequirementFile: (attachment: RequirementAttachment, context: RequirementUploadContext) => Promise<void>;
};

/*
 * Parent API integration contract:
 * POST /api/event-applications/:applicationId/templates/:templateId/attachments
 *   multipart field: file
 *   response: RequirementAttachment with id, fileName, size, mimeType, uploadedAt,
 *     uploadedBy, revision, status, reviewerVisible, reviewNote?, versions[].
 *
 * DELETE /api/event-applications/:applicationId/templates/:templateId/attachments/:attachmentId
 *   response: 204
 *
 * The current adapter keeps the prototype fully interactive until storage is wired.
 */
export const localRequirementUploadAdapter: RequirementUploadAdapter = {
  async uploadRequirementFile(file, context) {
    const nextRevision = (context.previousAttachment?.revision ?? 0) + 1;
    const uploadedAt = new Date().toISOString();
    const version: RequirementAttachmentVersion = {
      id: `${context.templateId}-v${Date.now()}`,
      fileName: file.name,
      size: file.size,
      uploadedAt,
      uploadedBy: context.uploaderName,
      revision: nextRevision,
      note: nextRevision > 1 ? "Replacement uploaded from the File Event screen." : "Initial upload from the File Event screen.",
    };

    return {
      ...version,
      id: context.previousAttachment?.id ?? `${context.templateId}-attachment-${Date.now()}`,
      mimeType: file.type || "application/octet-stream",
      status: "uploaded",
      reviewerVisible: true,
      versions: [...(context.previousAttachment?.versions ?? []), version],
    };
  },

  async removeRequirementFile() {
    return undefined;
  },
};
