import { useRef, useState } from "react";
import { Camera, Check, Trash2, Upload, X } from "lucide-react";
import { useApp } from "../lib/context";
import { uploadMedia } from "../lib/firebase";
import type { MediaAsset } from "../lib/types";
import { Avatar, ErrorBox } from "./ui";
import "./media.css";

export function ProfilePhotoEditor() {
  const { profile, call, refreshProfile, toast, demo } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<MediaAsset | null>(null),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  if (!profile) return null;
  async function select(file?: File) {
    if (!file || busy) return;
    setBusy("upload");
    setError("");
    setProgress(0);
    try {
      const asset = await uploadMedia(file, "avatar", setProgress);
      if (draft) void call("media.remove", { id: draft.id }).catch(() => {});
      setDraft(asset);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }
  async function save(remove = false) {
    if (!profile || busy) return;
    setBusy("save");
    setError("");
    try {
      await call("profile.save", {
        profile: { ...profile, avatarId: remove ? null : draft?.id },
      });
      await refreshProfile();
      setDraft(null);
      toast(remove ? "Profile photo removed." : "Profile photo updated.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  function cancel() {
    if (draft) void call("media.remove", { id: draft.id }).catch(() => {});
    setDraft(null);
    setError("");
  }
  return (
    <section
      className="profile-photo-editor card"
      aria-labelledby="photo-heading"
    >
      <div className="photo-editor-avatar">
        <Avatar
          name={profile.name}
          src={draft?.url || profile.avatarUrl}
          large
        />
        <span>
          <Camera size={16} />
        </span>
      </div>
      <div className="photo-editor-copy">
        <p className="overline">A FACE BEHIND THE RESEARCH</p>
        <h2 id="photo-heading">Your profile photo</h2>
        <p>
          Make it easier for people to recognize you in discussions, profiles,
          and messages.
        </p>
        <small>
          JPEG, PNG, or WebP · up to 5 MiB · center-cropped to a square
        </small>
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Profile photo"
          disabled={!!busy || demo}
          onChange={(e) => void select(e.target.files?.[0])}
        />
        <div className="button-row">
          <button
            type="button"
            className="button"
            disabled={!!busy || demo}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            {draft
              ? "Choose another"
              : profile.avatarUrl
                ? "Change photo"
                : "Upload a photo"}
          </button>
          {draft ? (
            <>
              <button
                type="button"
                className="button primary"
                disabled={!!busy}
                onClick={() => void save()}
              >
                <Check size={16} />
                {busy === "save" ? "Saving…" : "Save photo"}
              </button>
              <button
                type="button"
                className="text-link"
                disabled={!!busy}
                onClick={cancel}
              >
                <X size={15} />
                Discard
              </button>
            </>
          ) : (
            profile.avatarUrl && (
              <button
                type="button"
                className="text-link danger"
                disabled={!!busy}
                onClick={() => void save(true)}
              >
                <Trash2 size={15} />
                Remove photo
              </button>
            )
          )}
        </div>
        {busy === "upload" && (
          <div className="media-progress" role="status">
            <progress value={progress} max={100} />
            <span>
              {progress < 100
                ? `Uploading photo · ${progress}%`
                : "Preparing your photo…"}
            </span>
          </div>
        )}
        {draft && (
          <p className="photo-draft-note">
            Preview only. Save your photo to update your profile.
          </p>
        )}
        {demo && (
          <p className="fine-print">Photo uploads require a real account.</p>
        )}
        {error && <ErrorBox message={error} />}
      </div>
    </section>
  );
}
