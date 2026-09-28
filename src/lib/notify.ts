/** Asks the server to e-mail the notifications that were just created (fire and forget). */
export function flushNotificationEmails() {
  fetch("/api/notify/email", { method: "POST" }).catch(() => {
    /* e-mails are optional: the in-app bell already has the notification */
  });
}
