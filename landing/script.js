(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  async function joinWaitlist(email, comment) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email, comment: comment || null }),
    });

    if (!res.ok) {
      const body = await res.text();
      // Postgres unique_violation on a repeat signup -- treat as success.
      if (res.status === 409 || body.includes("duplicate key")) {
        return { ok: true, alreadyJoined: true };
      }
      throw new Error(`Signup failed (${res.status})`);
    }
    return { ok: true, alreadyJoined: false };
  }

  function wireForm(formId, emailId, messageId, commentId) {
    const form = document.getElementById(formId);
    const messageEl = document.getElementById(messageId);
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById(emailId).value.trim();
      const comment = commentId ? document.getElementById(commentId).value.trim() : "";

      const button = form.querySelector("button");
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Sending…";

      try {
        const result = await joinWaitlist(email, comment);
        messageEl.hidden = false;
        messageEl.classList.remove("error");
        messageEl.textContent = result.alreadyJoined
          ? "You're already on the list — thanks!"
          : "You're on the list. We'll email you when there's something to try.";
        form.reset();
      } catch (err) {
        messageEl.hidden = false;
        messageEl.classList.add("error");
        messageEl.textContent = "Something went wrong — please try again in a moment.";
        console.error(err);
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  }

  wireForm("signup-form", "email", "signup-message");
  wireForm("signup-form-2", "email-2", "signup-message-2", "comment-2");
})();
