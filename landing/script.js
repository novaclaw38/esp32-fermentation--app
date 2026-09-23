(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  // Goes through the join_waitlist RPC rather than inserting into the table:
  // the RPC validates the address and rate-limits each network, and direct
  // inserts are no longer granted to anonymous visitors.
  async function joinWaitlist(email, comment) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/join_waitlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_email: email, p_comment: comment || null }),
    });
    if (!res.ok) throw new Error(`Signup failed (${res.status})`);
    return res.json();
  }

  const MESSAGES = {
    joined: "You're on the list. We'll email you when there's something to try.",
    already: "You're already on the list. Thanks!",
    invalid_email: "That email address doesn't look right. Check it and try again.",
    too_many_attempts: "Too many signups from this network in the last hour. Try again later.",
    failed: "Something went wrong on our side. Please try again in a moment.",
  };

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
        if (result.ok) {
          messageEl.classList.remove("error");
          messageEl.textContent = result.already_joined ? MESSAGES.already : MESSAGES.joined;
          form.reset();
        } else {
          messageEl.classList.add("error");
          messageEl.textContent = MESSAGES[result.error] || MESSAGES.failed;
        }
      } catch (err) {
        messageEl.hidden = false;
        messageEl.classList.add("error");
        messageEl.textContent = MESSAGES.failed;
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
