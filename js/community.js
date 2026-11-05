import { apiFetch, requireAuth, getCurrentUser } from "./api.js";

const state = { friends: [], requests: [], blocks: [], notifications: [], unreadBySender: {}, activeFriend: null, contactFilter: "", unreadOnly: false, isSearching: false, pollTimer: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function setStatus(message, type = "") {
  const target = document.querySelector("[data-community-status]");
  if (target) { target.textContent = message; target.dataset.state = type; }
}

function initials(name) { return String(name || "M").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

function renderUnreadBadge(total = 0) {
  const unreadBadge = document.querySelector("[data-community-unread]");
  if (!unreadBadge) return;
  unreadBadge.textContent = `${Number(total || 0)} unread`;
  unreadBadge.hidden = !Number(total || 0);
}

function memberCard(member, action = "request") {
  const label = action === "request" ? "Add friend" : "Message";
  const online = member.lastSeenAt && Date.now() - new Date(member.lastSeenAt).getTime() < 5 * 60 * 1000;
  const unread = action === "message" ? Number(state.unreadBySender[member.uid] || 0) : 0;
  return `<article class="community-member ${state.activeFriend?.uid === member.uid ? "is-active" : ""}"><span class="avatar" aria-hidden="true">${escapeHtml(initials(member.name))}</span><div class="community-member-copy"><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.company || member.email || "MAT LEADS member")}</span><small class="community-presence ${online ? "online" : ""}">${online ? "Online now" : "Available for collaboration"}</small></div>${unread ? `<span class="community-unread-count" aria-label="${unread} unread messages">${unread > 99 ? "99+" : unread}</span>` : ""}<button class="btn btn-ghost btn-small" type="button" data-community-share-member="${escapeHtml(member.uid)}">Share</button><button class="btn btn-secondary btn-small" type="button" data-community-${action}="${escapeHtml(member.uid)}">${label}</button></article>`;
}

function renderFriends() {
  const target = document.querySelector("[data-community-count]");
  if (target) target.textContent = `${state.friends.length} friend${state.friends.length === 1 ? "" : "s"}`;
  const list = document.querySelector("[data-community-results]");
  if (!list || state.isSearching) return;
  const needle = state.contactFilter.toLowerCase();
  const visibleFriends = state.friends.filter((friend) => [friend.name, friend.email, friend.company].some((value) => String(value || "").toLowerCase().includes(needle))).filter((friend) => !state.unreadOnly || Number(state.unreadBySender[friend.uid] || 0) > 0);
  list.innerHTML = visibleFriends.length ? `<div class="community-list-title">${needle ? "Matching conversations" : "Your conversations"}</div>${visibleFriends.map((friend) => memberCard(friend, "message")).join("")}` : `<div class="empty-state"><strong>${needle ? "No matching conversations" : "No friends yet"}</strong><span>${needle ? "Try another name or company." : "Search above to find other members."}</span></div>`;
}

function renderRequests() {
  const target = document.querySelector("[data-community-requests]");
  if (!target) return;
  const incoming = state.requests.filter((request) => request.direction === "incoming");
  target.innerHTML = incoming.length ? incoming.map((request) => `<article class="community-member"><span class="avatar" aria-hidden="true">${escapeHtml(initials(request.name))}</span><div class="community-member-copy"><strong>${escapeHtml(request.name)}</strong><span>wants to connect</span></div><button class="btn btn-primary btn-small" type="button" data-community-accept="${escapeHtml(request.id)}">Accept</button><button class="icon-button" type="button" data-community-decline="${escapeHtml(request.id)}" aria-label="Decline request">x</button></article>`).join("") : `<p class="muted">No pending requests.</p>`;
}

function renderBlocks() {
  const target = document.querySelector("[data-community-blocks]");
  if (!target) return;
  target.innerHTML = state.blocks.length ? state.blocks.map((member) => `<article class="community-member"><span class="avatar" aria-hidden="true">${escapeHtml(initials(member.name))}</span><div class="community-member-copy"><strong>${escapeHtml(member.name)}</strong><span>Blocked from contacting you</span></div><button class="btn btn-ghost btn-small" type="button" data-community-unblock="${escapeHtml(member.uid)}">Unblock</button></article>`).join("") : `<p class="muted">No blocked members.</p>`;
}

function renderNotifications(unread = 0) {
  const count = document.querySelector("[data-community-notification-count]");
  if (count) { count.textContent = String(unread); count.hidden = !Number(unread); }
  const target = document.querySelector("[data-community-notifications]");
  if (!target) return;
  target.innerHTML = state.notifications.length ? state.notifications.map((notification) => `<article class="community-notification ${notification.readAt ? "is-read" : ""}"><span class="community-notification-icon" aria-hidden="true">${notification.type === "message" ? "M" : "N"}</span><div><strong>${escapeHtml(notification.title)}</strong><p>${escapeHtml(notification.body)}</p><time>${escapeHtml(new Date(notification.createdAt).toLocaleString())}</time></div>${notification.readAt ? "" : `<button class="btn btn-ghost btn-small" type="button" data-community-notification-read="${escapeHtml(notification.id)}">Mark read</button>`}</article>`).join("") : `<div class="empty-state"><strong>You're all caught up</strong><span>New connection and message updates will appear here.</span></div>`;
}

async function loadNotifications() {
  const result = await apiFetch("/api/social/notifications");
  state.notifications = result.notifications || [];
  renderNotifications(result.unread || 0);
  return result;
}

async function loadNetwork() {
  const [friends, requests, unread, blocks, notifications] = await Promise.all([apiFetch("/api/social/friends"), apiFetch("/api/social/requests"), apiFetch("/api/social/unread"), apiFetch("/api/social/blocks"), apiFetch("/api/social/notifications")]);
  state.friends = friends.friends || [];
  state.requests = requests.requests || [];
  state.unreadBySender = unread.bySender || {};
  state.blocks = blocks.members || [];
  state.notifications = notifications.notifications || [];
  renderUnreadBadge(unread.total);
  renderFriends();
  renderRequests();
  renderBlocks();
  renderNotifications(notifications.unread);
}

function showSearchResults(users) {
  const target = document.querySelector("[data-community-results]");
  if (!target) return;
  state.isSearching = true;
  document.querySelector("[data-community-show-inbox]")?.removeAttribute("hidden");
  target.innerHTML = users.length ? `<div class="community-list-title">Search results</div>${users.map((user) => memberCard(user)).join("")}` : `<div class="empty-state"><strong>No members found</strong><span>Try a different name, email, or company.</span></div>`;
}

function showInbox() {
  state.isSearching = false;
  state.contactFilter = "";
  const filter = document.querySelector("#conversationFilter");
  if (filter) filter.value = "";
  document.querySelector("[data-community-show-inbox]")?.setAttribute("hidden", "");
  renderFriends();
}

function filterMessages(query = "") {
  const needle = String(query).trim().toLowerCase();
  document.querySelectorAll("[data-message-search-text]").forEach((message) => {
    message.hidden = Boolean(needle) && !message.dataset.messageSearchText.includes(needle);
  });
}

function draftKey(friendId) {
  return `mat-community-draft:${String(friendId || "")}`;
}

function saveDraft() {
  if (!state.activeFriend) return;
  const input = document.querySelector("#communityMessage");
  try { localStorage.setItem(draftKey(state.activeFriend.uid), input?.value || ""); } catch {}
}

async function copyText(value) {
  const text = String(value || "");
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function openChat(friend) {
  state.activeFriend = friend;
  const avatar = document.querySelector("[data-community-chat-avatar]");
  if (avatar) avatar.textContent = initials(friend.name);
  document.querySelector("[data-community-chat-title]").textContent = friend.name;
  document.querySelector("[data-community-chat-subtitle]").textContent = friend.email || friend.company || "Private conversation";
  document.querySelector("[data-community-message-form]").hidden = false;
  document.querySelector("[data-community-remove]").hidden = false;
  document.querySelector("[data-community-block]").hidden = false;
  document.querySelector("[data-community-report]").hidden = false;
  document.querySelector("[data-community-share-chat]").hidden = false;
  document.querySelector("[data-community-message-search]").hidden = false;
  const draft = document.querySelector("#communityMessage");
  if (draft) { try { draft.value = localStorage.getItem(draftKey(friend.uid)) || ""; } catch {} }
  loadMessages();
}

function communityUrl(params) {
  const url = new URL("/community.html", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function shareLink(url, message = "Link copied to clipboard.") {
  await copyText(url);
  setStatus(message, "success");
}

async function openSharedLink() {
  const params = new URLSearchParams(window.location.search);
  const chatId = params.get("chat");
  const profileId = params.get("profile");
  if (chatId) {
    const friend = state.friends.find((item) => item.uid === chatId);
    if (friend) openChat(friend);
    else setStatus("This chat link is not available until you are accepted as friends.", "error");
    return;
  }
  if (profileId) {
    try {
      const result = await apiFetch(`/api/social/profile/${encodeURIComponent(profileId)}`);
      showSearchResults([result.profile]);
      setStatus("Profile loaded. Send a friend request to start chatting.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  }
}

function reactionSummary(reactions = []) {
  return Object.entries(reactions.reduce((summary, reaction) => {
    summary[reaction.emoji] = (summary[reaction.emoji] || 0) + 1;
    return summary;
  }, {})).map(([emoji, count]) => `<span class="community-reaction-total">${escapeHtml(emoji)} ${count}</span>`).join("");
}

function messageMarkup(message, myId) {
  const mine = message.senderId === myId;
  const removed = Boolean(message.deletedAt);
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  return `<article class="community-message-row ${mine ? "mine" : "theirs"}" data-message-search-text="${escapeHtml((message.text || "This message was removed.").toLowerCase())}">
    <div class="community-bubble ${mine ? "mine" : "theirs"} ${removed ? "is-removed" : ""}">
      <p>${removed ? "This message was removed." : escapeHtml(message.text)}</p>
      ${removed ? "" : `<div class="community-reaction-totals">${reactionSummary(reactions)}</div>`}
      <time>${escapeHtml(new Date(message.createdAt).toLocaleString())}${message.editedAt && !removed ? " - edited" : ""}${mine && message.readAt && !removed ? " - Seen" : ""}</time>
    </div>
    ${removed ? "" : `<div class="community-message-actions" aria-label="Message actions">
      ${["👍", "❤️", "🎉", "👀"].map((emoji) => `<button class="community-reaction-button" type="button" data-community-react="${escapeHtml(emoji)}" data-community-message-id="${escapeHtml(message.id)}" aria-label="React ${escapeHtml(emoji)}">${emoji}</button>`).join("")}
      <button class="community-message-copy" type="button" data-community-copy-message="${escapeHtml(message.id)}">Copy</button>
      ${mine ? `<button class="community-message-edit" type="button" data-community-edit-message="${escapeHtml(message.id)}">Edit</button><button class="community-message-remove" type="button" data-community-delete-message="${escapeHtml(message.id)}">Remove</button>` : ""}
    </div>`}
  </article>`;
}

async function loadMessages() {
  if (!state.activeFriend) return;
  try {
    const result = await apiFetch(`/api/social/conversations/${encodeURIComponent(state.activeFriend.uid)}/messages`);
    const target = document.querySelector("[data-community-messages]");
    const me = getCurrentUser()?.uid || getCurrentUser()?.id;
    target.innerHTML = result.messages?.length ? result.messages.map((message) => messageMarkup(message, me)).join("") : `<div class="empty-state"><strong>Start the conversation</strong><span>Say hello to ${escapeHtml(state.activeFriend.name)}.</span></div>`;
    state.unreadBySender[state.activeFriend.uid] = 0;
    renderUnreadBadge(Object.values(state.unreadBySender).reduce((total, count) => total + Number(count || 0), 0));
    target.scrollTop = target.scrollHeight;
    const messageFilter = document.querySelector("[data-community-message-filter]");
    if (messageFilter && !messageFilter.hidden && messageFilter.value.trim()) filterMessages(messageFilter.value);
  } catch (error) { setStatus(error.message, "error"); }
}

async function search(event) {
  event.preventDefault();
  const query = document.querySelector("#communityQuery").value.trim();
  if (query.length < 2) return setStatus("Enter at least two characters to search.", "error");
  setStatus("Searching...");
  try { showSearchResults((await apiFetch(`/api/social/users?q=${encodeURIComponent(query)}`)).users || []); setStatus(""); } catch (error) { setStatus(error.message, "error"); }
}

async function sendMessage(event) {
  event.preventDefault();
  if (!state.activeFriend) return;
  const form = event.currentTarget;
  const text = form.querySelector("textarea").value.trim();
  if (!text) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try { await apiFetch(`/api/social/conversations/${encodeURIComponent(state.activeFriend.uid)}/messages`, { method: "POST", body: JSON.stringify({ text }) }); try { localStorage.removeItem(draftKey(state.activeFriend.uid)); } catch {} form.reset(); await loadMessages(); } catch (error) { setStatus(error.message, "error"); } finally { button.disabled = false; }
}

function handleComposerKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

document.addEventListener("click", async (event) => {
  const requestButton = event.target.closest("[data-community-request]");
  const messageButton = event.target.closest("[data-community-message]");
  const acceptButton = event.target.closest("[data-community-accept]");
  const declineButton = event.target.closest("[data-community-decline]");
  const removeButton = event.target.closest("[data-community-remove]");
  const reactionButton = event.target.closest("[data-community-react]");
  const deleteMessageButton = event.target.closest("[data-community-delete-message]");
  const blockButton = event.target.closest("[data-community-block]");
  const reportButton = event.target.closest("[data-community-report]");
  const inboxButton = event.target.closest("[data-community-show-inbox]");
  const filterButton = event.target.closest("[data-community-filter]");
  const unblockButton = event.target.closest("[data-community-unblock]");
  const notificationToggle = event.target.closest("[data-community-notification-toggle]");
  const notificationRefresh = event.target.closest("[data-community-notification-refresh]");
  const notificationRead = event.target.closest("[data-community-notification-read]");
  const notificationReadAll = event.target.closest("[data-community-notification-read-all]");
  const editMessageButton = event.target.closest("[data-community-edit-message]");
  const copyMessageButton = event.target.closest("[data-community-copy-message]");
  const messageSearchButton = event.target.closest("[data-community-message-search]");
  const shareProfileButton = event.target.closest("[data-community-share-profile]");
  const shareChatButton = event.target.closest("[data-community-share-chat]");
  const shareMemberButton = event.target.closest("[data-community-share-member]");
  try {
    if (inboxButton) showInbox();
    if (filterButton) {
      state.unreadOnly = filterButton.dataset.communityFilter === "unread";
      document.querySelectorAll("[data-community-filter]").forEach((button) => {
        const active = button === filterButton;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
      renderFriends();
    }
    if (unblockButton) { await apiFetch(`/api/social/blocks/${encodeURIComponent(unblockButton.dataset.communityUnblock)}`, { method: "DELETE" }); await loadNetwork(); }
    if (notificationToggle) { const panel = document.querySelector("[data-community-notification-panel]"); const open = panel?.hidden; if (panel) panel.hidden = !open; notificationToggle.setAttribute("aria-expanded", String(open)); if (open) await loadNotifications(); }
    if (notificationRefresh) await loadNotifications();
    if (notificationRead) { await apiFetch(`/api/social/notifications/${encodeURIComponent(notificationRead.dataset.communityNotificationRead)}/read`, { method: "POST" }); await loadNotifications(); }
    if (notificationReadAll) { await apiFetch("/api/social/notifications/read-all", { method: "POST" }); await loadNotifications(); }
    if (messageSearchButton) { const input = document.querySelector("[data-community-message-filter]"); if (input) { input.hidden = !input.hidden; messageSearchButton.setAttribute("aria-expanded", String(!input.hidden)); if (!input.hidden) input.focus(); else { input.value = ""; filterMessages(); } } }
    if (shareProfileButton) { const me = getCurrentUser(); await shareLink(communityUrl({ profile: me?.uid || me?.id || "" }), "Your profile link is ready to share."); }
    if (shareChatButton && state.activeFriend) await shareLink(communityUrl({ chat: state.activeFriend.uid }), "Secure chat link copied. Only accepted friends can open the conversation.");
    if (shareMemberButton) await shareLink(communityUrl({ profile: shareMemberButton.dataset.communityShareMember }), "Profile link copied.");
    if (editMessageButton && state.activeFriend) { const row = editMessageButton.closest("[data-message-search-text]"); const current = row?.querySelector(".community-bubble p")?.textContent || ""; const updated = window.prompt("Edit your message:", current); if (updated !== null && updated.trim() && updated.trim() !== current.trim()) { await apiFetch(`/api/social/conversations/${encodeURIComponent(state.activeFriend.uid)}/messages/${encodeURIComponent(editMessageButton.dataset.communityEditMessage)}`, { method: "PATCH", body: JSON.stringify({ text: updated.trim() }) }); await loadMessages(); } }
    if (copyMessageButton) { const text = copyMessageButton.closest("[data-message-search-text]")?.querySelector(".community-bubble p")?.textContent || ""; await copyText(text); setStatus("Message copied.", "success"); }
    if (requestButton) { await apiFetch("/api/social/requests", { method: "POST", body: JSON.stringify({ userId: requestButton.dataset.communityRequest }) }); requestButton.disabled = true; requestButton.textContent = "Requested"; }
    if (messageButton) openChat(state.friends.find((friend) => friend.uid === messageButton.dataset.communityMessage));
    if (acceptButton) { await apiFetch(`/api/social/requests/${encodeURIComponent(acceptButton.dataset.communityAccept)}`, { method: "PATCH", body: JSON.stringify({ action: "accept" }) }); await loadNetwork(); }
    if (declineButton) { await apiFetch(`/api/social/requests/${encodeURIComponent(declineButton.dataset.communityDecline)}`, { method: "PATCH", body: JSON.stringify({ action: "decline" }) }); await loadNetwork(); }
    if (reactionButton && state.activeFriend) { await apiFetch(`/api/social/conversations/${encodeURIComponent(state.activeFriend.uid)}/messages/${encodeURIComponent(reactionButton.dataset.communityMessageId)}/reactions`, { method: "POST", body: JSON.stringify({ emoji: reactionButton.dataset.communityReact }) }); await loadMessages(); }
    if (deleteMessageButton && state.activeFriend && window.confirm("Remove this message for everyone in the conversation?")) { await apiFetch(`/api/social/conversations/${encodeURIComponent(state.activeFriend.uid)}/messages/${encodeURIComponent(deleteMessageButton.dataset.communityDeleteMessage)}`, { method: "DELETE" }); await loadMessages(); }
    if (blockButton && state.activeFriend && window.confirm(`Block ${state.activeFriend.name}? You will no longer be able to message each other.`)) { await apiFetch("/api/social/blocks", { method: "POST", body: JSON.stringify({ userId: state.activeFriend.uid }) }); resetChat(); await loadNetwork(); setStatus("Member blocked. You can manage blocks from your account safety settings when available.", "success"); }
    if (reportButton && state.activeFriend) { const description = window.prompt("Briefly describe the issue (optional):", ""); if (description !== null) { await apiFetch(`/api/social/reports/${encodeURIComponent(state.activeFriend.uid)}`, { method: "POST", body: JSON.stringify({ category: "other", description }) }); setStatus("Report received. Our moderation team can review it.", "success"); } }
    if (removeButton && state.activeFriend && window.confirm(`Remove ${state.activeFriend.name} from your friends?`)) { await apiFetch(`/api/social/friends/${encodeURIComponent(state.activeFriend.uid)}`, { method: "DELETE" }); resetChat(); await loadNetwork(); }
  } catch (error) { setStatus(error.message, "error"); }
});

function resetChat() {
  state.activeFriend = null;
  document.querySelector("[data-community-chat-title]").textContent = "Choose a conversation";
  document.querySelector("[data-community-chat-subtitle]").textContent = "Select a contact from your inbox to start chatting.";
  const avatar = document.querySelector("[data-community-chat-avatar]");
  if (avatar) avatar.textContent = "M";
  document.querySelector("[data-community-message-form]").hidden = true;
  ["[data-community-remove]", "[data-community-block]", "[data-community-report]", "[data-community-message-search]", "[data-community-message-filter]"].forEach((selector) => { const control = document.querySelector(selector); if (control) control.hidden = true; });
  document.querySelector("[data-community-share-chat]")?.setAttribute("hidden", "");
  document.querySelector("[data-community-message-search]")?.setAttribute("aria-expanded", "false");
  const messages = document.querySelector("[data-community-messages]");
  if (messages) messages.innerHTML = `<div class="empty-state"><strong>Your conversations live here</strong><span>Choose a trusted contact to continue working together.</span></div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  document.querySelector("[data-community-search-form]")?.addEventListener("submit", search);
  document.querySelector("[data-community-message-form]")?.addEventListener("submit", sendMessage);
  document.querySelector("#communityMessage")?.addEventListener("keydown", handleComposerKeydown);
  document.querySelector("#communityMessage")?.addEventListener("input", saveDraft);
  document.querySelector("[data-community-message-filter]")?.addEventListener("input", (event) => filterMessages(event.currentTarget.value));
  document.querySelector("#conversationFilter")?.addEventListener("input", (event) => { state.contactFilter = event.currentTarget.value.trim(); state.isSearching = false; document.querySelector("[data-community-show-inbox]")?.setAttribute("hidden", ""); renderFriends(); });
  document.querySelector("[data-community-refresh]")?.addEventListener("click", () => loadNetwork().catch((error) => setStatus(error.message, "error")));
  try { await loadNetwork(); await openSharedLink(); } catch (error) { setStatus(error.message, "error"); }
  const heartbeat = () => apiFetch("/api/social/presence", { method: "POST" }).catch(() => {});
  heartbeat();
  window.setInterval(heartbeat, 60000);
  state.pollTimer = window.setInterval(() => { if (state.activeFriend) loadMessages(); }, 5000);
});
