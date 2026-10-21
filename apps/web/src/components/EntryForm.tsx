import { useState, type FormEvent } from "react";
import { api, errorMessage, type Deal, type Interaction } from "../lib/api";
import { Modal } from "./Modal";

export function EntryForm({
  kind,
  deal,
  onClose,
  onSaved,
}: {
  kind: "create" | "ingest";
  deal?: Deal;
  onClose: () => void;
  onSaved: (id?: string, retained?: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [storedFailure, setStoredFailure] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      if (kind === "create") {
        const { data } = await api.post<{ id: string }>("/deals", {
          company: { name: form.get("company") },
          name: form.get("name"),
          value: form.get("value") || null,
          stage: "discovery",
        });
        onSaved(data.id);
      } else {
        const { data } = await api.post<Interaction>(
          `/deals/${deal!.id}/interactions`,
          {
            subject: form.get("subject"),
            interaction_type: form.get("type"),
            content: form.get("content"),
            occurred_at: new Date(String(form.get("date"))).toISOString(),
          },
        );
        onSaved(undefined, data.memory_status === "succeeded");
      }
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      // Retention can fail after PostgreSQL has committed. Avoid accidental duplicates.
      if (kind === "ingest") setStoredFailure(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={kind === "create" ? "A new opportunity" : "Capture the moment"}
      onClose={saving ? () => {} : onClose}
    >
      <form className="entry-form" onSubmit={submit}>
        <p className="modal-description">
          {kind === "create"
            ? "Start with the account. Build the story as you go."
            : `Add what happened at ${deal?.company.name}. Include who was involved, what changed, and the context Rosy should remember.`}
        </p>
        {kind === "create" ? (
          <>
            <label>
              Company
              <input
                name="company"
                required
                minLength={2}
                maxLength={255}
                placeholder="Company name"
                autoFocus
              />
            </label>
            <label>
              Deal name
              <input
                name="name"
                required
                minLength={2}
                maxLength={255}
                placeholder="Enterprise rollout"
              />
            </label>
            <label>
              Deal value (USD)
              <input
                name="value"
                type="number"
                min="0"
                step="0.01"
                placeholder="Optional"
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Subject
              <input
                name="subject"
                required
                maxLength={500}
                placeholder="What was the conversation about?"
                autoFocus
              />
            </label>
            <div className="form-row">
              <label>
                Type
                <select name="type">
                  <option value="meeting">Meeting</option>
                  <option value="email">Email</option>
                  <option value="note">Note</option>
                </select>
              </label>
              <label>
                When
                <input name="date" type="datetime-local" required />
              </label>
            </div>
            <label>
              Conversation
              <textarea
                name="content"
                required
                minLength={20}
                maxLength={100000}
                placeholder="Paste the meeting transcript, email, or note…"
                rows={7}
              />
            </label>
          </>
        )}
        {error && (
          <div role="alert" className="error-box">
            {error}
            {storedFailure && (
              <p>
                The interaction may already be saved. Close and inspect the
                timeline before submitting it again.
              </p>
            )}
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={storedFailure ? () => onSaved() : onClose}
          >
            {storedFailure ? "Inspect timeline" : "Cancel"}
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={saving || storedFailure}
          >
            {saving ? (
              <>
                <span className="spinner" />
                {kind === "create" ? "Creating…" : "Retaining memory…"}
              </>
            ) : kind === "create" ? (
              "Create deal"
            ) : (
              "Save to memory"
            )}
          </button>
        </div>
        {saving && kind === "ingest" && (
          <p className="fine-print" role="status">
            Keep this window open. Local memory extraction can take a few
            minutes.
          </p>
        )}
      </form>
    </Modal>
  );
}
