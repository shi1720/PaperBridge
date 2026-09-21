export type RecordData = { id: string; [key: string]: any };
export interface Profile extends RecordData {
  name: string;
  avatarId?: string | null;
  avatarUrl?: string;
  role: "researcher" | "endorser";
  headline: string;
  institution: string;
  bio: string;
  categories: string[];
  acceptingRequests: boolean;
  weeklyCapacity: number;
  publicProfile: boolean;
  arxivUrl: string;
  orcid: string;
}
export const STATUS: Record<string, string> = {
  pending: "Awaiting reply",
  reviewing: "In review",
  changes_requested: "Feedback received",
  accepted: "Willing to endorse",
  declined: "Declined",
  withdrawn: "Withdrawn",
  endorsed: "Completion reported",
};
export const date = (n: number) =>
  new Date(n).toLocaleDateString("en", { month: "short", day: "numeric" });
export const initials = (name: string = "Researcher") =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export type PostType = "update" | "question" | "paper" | "milestone";
export type MediaAsset = {
  id: string;
  purpose?: "avatar" | "community";
  kind: "image" | "pdf";
  fileName: string;
  size: number;
  contentType: string;
  url: string;
  width?: number;
  height?: number;
};
