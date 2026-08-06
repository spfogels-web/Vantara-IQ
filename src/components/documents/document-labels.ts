import type { Tone } from "@/lib/types";

/**
 * Human labels for the controlled document statuses and types.
 *
 * Shared rather than duplicated per screen: the list, the viewer and the
 * project tab all name the same status, and two screens quietly disagreeing
 * about what "executed" is called is how a status stops meaning anything.
 */
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  INTERNAL_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  READY_TO_SEND: "Ready to send",
  SENT: "Sent",
  VIEWED: "Viewed",
  PARTIALLY_SIGNED: "Partly signed",
  SIGNED: "Signed",
  EXECUTED: "Executed",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
  ARCHIVED: "Archived",
  VOIDED: "Voided",
};

export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  INTERNAL_REVIEW: "warning",
  CHANGES_REQUESTED: "critical",
  APPROVED: "info",
  READY_TO_SEND: "info",
  SENT: "info",
  VIEWED: "info",
  PARTIALLY_SIGNED: "warning",
  SIGNED: "success",
  EXECUTED: "success",
  EXPIRED: "critical",
  SUPERSEDED: "neutral",
  ARCHIVED: "neutral",
  VOIDED: "critical",
};

export const TYPE_LABEL: Record<string, string> = {
  NDA: "NDA",
  MASTER_SUBCONTRACTOR_AGREEMENT: "Master subcontract",
  PROJECT_SUBCONTRACTOR_AGREEMENT: "Project agreement",
  SUBCONTRACTOR_RATE_CARD: "Rate card",
  CHANGE_ORDER: "Change order",
  PURCHASE_ORDER: "Purchase order",
  CUSTOMER_CONTRACT: "Customer contract",
  WORK_AUTHORIZATION: "Work authorization",
  INSURANCE_REQUEST: "Insurance request",
  W9_REQUEST: "W-9 request",
  LIEN_WAIVER: "Lien waiver",
  SAFETY_FORM: "Safety form",
  EMPLOYMENT_DOCUMENT: "Employment",
  VENDOR_AGREEMENT: "Vendor agreement",
  CLOSEOUT: "Closeout",
  CUSTOM: "Document",
};
