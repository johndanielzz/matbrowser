import { randomUUID } from "node:crypto";
import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { AppError } from "../utils/errors.js";

// Account-scoped social primitives. Only display-safe profile fields leave this
// service; passwords, billing, lead data, and private account settings never do.
export class SocialService {
  constructor() {
    this.users = new FirestoreRepository("users");
    this.friendships = new FirestoreRepository("socialFriendships");
    this.messages = new FirestoreRepository("socialMessages");
    this.blocks = new FirestoreRepository("socialBlocks");
    this.reports = new FirestoreRepository("socialReports");
    this.notifications = new FirestoreRepository("socialNotifications");
  }

  profile(user) {
    return {
      uid: String(user?.uid || user?.id || ""),
      name: String(user?.name || "MAT LEADS member").slice(0, 120),
      email: String(user?.email || "").slice(0, 255),
      company: String(user?.company || "").slice(0, 160),
      lastSeenAt: String(user?.lastSeenAt || "")
    };
  }

  idFor(user) {
    const id = String(user?.uid || user?.id || "").trim();
    if (!id) throw new AppError("Authenticated account is missing an id.", 401, "AUTH_REQUIRED");
    return id;
  }

  friendshipId(a, b) {
    return `friend:${[String(a), String(b)].sort().join(":")}`;
  }

  blockId(blockerId, blockedId) {
    return `block:${String(blockerId)}:${String(blockedId)}`;
  }

  async isBlocked(a, b) {
    const [byFirst, bySecond] = await Promise.all([
      this.blocks.findById(this.blockId(a, b)),
      this.blocks.findById(this.blockId(b, a))
    ]);
    return Boolean(byFirst?.active || bySecond?.active);
  }

  async assertNotBlocked(a, b) {
    if (await this.isBlocked(a, b)) {
      throw new AppError("This conversation is not available.", 403, "CONVERSATION_UNAVAILABLE");
    }
  }

  async userById(uid) {
    const user = await this.users.findById(uid);
    return user ? this.profile(user) : null;
  }

  async publicProfile(user, uid) {
    const me = this.idFor(user);
    const profile = await this.userById(uid);
    if (!profile || profile.uid === me) throw new AppError("That member could not be found.", 404, "MEMBER_NOT_FOUND");
    return {
      uid: profile.uid,
      name: profile.name,
      company: profile.company,
      lastSeenAt: profile.lastSeenAt
    };
  }

  async notify(recipientId, type, title, body, data = {}) {
    return this.notifications.create({
      id: randomUUID(),
      recipientId: String(recipientId),
      type: String(type),
      title: String(title).slice(0, 160),
      body: String(body).slice(0, 500),
      data: data && typeof data === "object" ? data : {},
      readAt: ""
    });
  }

  async listNotifications(user) {
    const recipientId = this.idFor(user);
    const records = await this.notifications.list({ where: [{ field: "recipientId", op: "==", value: recipientId }], limit: 50, orderBy: "createdAt" });
    return {
      notifications: records.reverse().map((record) => ({ id: record.id, type: record.type, title: record.title, body: record.body, data: record.data || {}, createdAt: record.createdAt, readAt: record.readAt || "" })),
      unread: records.filter((record) => !record.readAt).length
    };
  }

  async readNotification(user, notificationId) {
    const recipientId = this.idFor(user);
    const record = await this.notifications.findById(notificationId);
    if (!record || record.recipientId !== recipientId) throw new AppError("Notification not found.", 404, "NOTIFICATION_NOT_FOUND");
    return this.notifications.upsert(notificationId, { ...record, readAt: record.readAt || new Date().toISOString() });
  }

  async readAllNotifications(user) {
    const recipientId = this.idFor(user);
    const records = await this.notifications.list({ where: [{ field: "recipientId", op: "==", value: recipientId }], limit: 500, orderBy: "createdAt" });
    const now = new Date().toISOString();
    await Promise.all(records.filter((record) => !record.readAt).map((record) => this.notifications.upsert(record.id, { ...record, readAt: now })));
    return { markedRead: records.filter((record) => !record.readAt).length };
  }

  async searchUsers(user, query) {
    const me = this.idFor(user);
    const needle = String(query || "").trim().toLowerCase();
    if (needle.length < 2) return [];
    // Keep the query bounded while remaining compatible with both Firestore and
    // the local repository fallback. Production installations can add an index
    // later without changing this API contract.
    const candidates = await this.users.list({ limit: 1000, orderBy: "updatedAt" });
    return candidates
      .map((candidate) => this.profile(candidate))
      .filter((candidate) => candidate.uid !== me)
      .filter((candidate) => [candidate.name, candidate.email, candidate.company].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 25);
  }

  async touchPresence(user) {
    const uid = this.idFor(user);
    const lastSeenAt = new Date().toISOString();
    await this.users.upsert(uid, { lastSeenAt });
    return { lastSeenAt };
  }

  async listBlocks(user) {
    const me = this.idFor(user);
    const records = await this.blocks.list({ where: [{ field: "blockerId", op: "==", value: me }], limit: 500, orderBy: "updatedAt" });
    const profiles = await Promise.all(records.filter((record) => record.active).map(async (record) => this.userById(record.blockedId)));
    return profiles.filter(Boolean);
  }

  async block(user, blockedId) {
    const blockerId = this.idFor(user);
    const target = await this.userById(blockedId);
    if (!target || target.uid === blockerId) throw new AppError("That member could not be found.", 404, "MEMBER_NOT_FOUND");
    const now = new Date().toISOString();
    return this.blocks.upsert(this.blockId(blockerId, target.uid), { blockerId, blockedId: target.uid, active: true, blockedAt: now });
  }

  async unblock(user, blockedId) {
    const blockerId = this.idFor(user);
    const id = this.blockId(blockerId, blockedId);
    const existing = await this.blocks.findById(id);
    if (!existing?.active) return false;
    await this.blocks.upsert(id, { ...existing, active: false, unblockedAt: new Date().toISOString() });
    return true;
  }

  async report(user, reportedUserId, category, description) {
    const reporterId = this.idFor(user);
    const target = await this.userById(reportedUserId);
    if (!target || target.uid === reporterId) throw new AppError("That member could not be found.", 404, "MEMBER_NOT_FOUND");
    return this.reports.create({ id: randomUUID(), reporterId, reportedUserId: target.uid, category, description, status: "open" });
  }

  async unread(user) {
    const me = this.idFor(user);
    const records = await this.messages.list({ where: [{ field: "recipientId", op: "==", value: me }], limit: 500, orderBy: "createdAt" });
    const bySender = {};
    for (const record of records) {
      if (!record.readAt) bySender[record.senderId] = (bySender[record.senderId] || 0) + 1;
    }
    return { total: Object.values(bySender).reduce((total, count) => total + count, 0), bySender };
  }

  async friends(user) {
    const me = this.idFor(user);
    const records = await this.friendships.list({ limit: 500, orderBy: "updatedAt" });
    const accepted = records.filter((record) => record.status === "accepted" && [record.userA, record.userB].includes(me));
    const results = await Promise.all(accepted.map(async (record) => {
      const uid = record.userA === me ? record.userB : record.userA;
      if (await this.isBlocked(me, uid)) return null;
      const profile = await this.userById(uid);
      return profile ? { ...profile, friendshipId: record.id, since: record.updatedAt || record.createdAt } : null;
    }));
    return results.filter(Boolean);
  }

  async requests(user) {
    const me = this.idFor(user);
    const records = await this.friendships.list({ limit: 500, orderBy: "updatedAt" });
    const relevant = records.filter((record) => record.status === "pending" && [record.requestedBy, record.recipientId].includes(me));
    const items = await Promise.all(relevant.map(async (record) => {
      const otherId = record.requestedBy === me ? record.recipientId : record.requestedBy;
      const profile = await this.userById(otherId);
      return profile ? { ...profile, id: record.id, direction: record.recipientId === me ? "incoming" : "outgoing", createdAt: record.createdAt } : null;
    }));
    return items.filter(Boolean);
  }

  async request(user, recipientId) {
    const senderId = this.idFor(user);
    const recipient = await this.userById(recipientId);
    if (!recipient || recipient.uid === senderId) throw new AppError("That member could not be found.", 404, "MEMBER_NOT_FOUND");
    await this.assertNotBlocked(senderId, recipient.uid);
    const id = this.friendshipId(senderId, recipient.uid);
    const existing = await this.friendships.findById(id);
    if (existing?.status === "accepted") return existing;
    if (existing?.status === "pending") {
      if (existing.requestedBy === senderId) return existing;
      throw new AppError("This member has already sent you a friend request. Review your requests.", 409, "REQUEST_EXISTS");
    }
    const request = await this.friendships.upsert(id, {
      id,
      userA: [senderId, recipient.uid].sort()[0],
      userB: [senderId, recipient.uid].sort()[1],
      requestedBy: senderId,
      recipientId: recipient.uid,
      status: "pending"
    });
    await this.notify(recipient.uid, "friend_request", "New friend request", `${String(user?.name || "A MAT LEADS member")} wants to connect with you.`, { userId: senderId });
    return request;
  }

  async respond(user, friendshipId, action) {
    const me = this.idFor(user);
    const record = await this.friendships.findById(friendshipId);
    if (!record || record.recipientId !== me || record.status !== "pending") throw new AppError("Friend request not found.", 404, "REQUEST_NOT_FOUND");
    const status = action === "accept" ? "accepted" : "declined";
    const updated = await this.friendships.upsert(friendshipId, { ...record, status, respondedAt: new Date().toISOString() });
    if (status === "accepted") await this.notify(record.requestedBy, "friend_accepted", "Friend request accepted", `${String(user?.name || "Your contact")} accepted your friend request.`, { userId: me });
    return updated;
  }

  async remove(user, otherId) {
    const me = this.idFor(user);
    const id = this.friendshipId(me, otherId);
    const record = await this.friendships.findById(id);
    if (!record || ![record.userA, record.userB].includes(me)) return false;
    await this.friendships.upsert(id, { ...record, status: "removed", removedAt: new Date().toISOString() });
    return true;
  }

  async assertFriends(a, b) {
    await this.assertNotBlocked(a, b);
    const id = this.friendshipId(a, b);
    const record = await this.friendships.findById(id);
    if (!record || record.status !== "accepted") throw new AppError("You can chat after accepting a friend request.", 403, "FRIENDS_ONLY");
    return record;
  }

  async listMessages(user, otherId) {
    const me = this.idFor(user);
    await this.assertFriends(me, otherId);
    const conversationId = this.friendshipId(me, otherId);
    const records = await this.messages.list({ where: [{ field: "conversationId", op: "==", value: conversationId }], limit: 100, orderBy: "createdAt" });
    const unread = records.filter((record) => record.recipientId === me && !record.readAt);
    await Promise.all(unread.map((record) => this.messages.upsert(record.id, { ...record, readAt: new Date().toISOString() })));
    return records.reverse().map((record) => ({
      id: record.id,
      senderId: record.senderId,
      recipientId: record.recipientId,
      text: record.deletedAt ? "" : record.text,
      createdAt: record.createdAt,
      readAt: record.readAt || (record.recipientId === me ? new Date().toISOString() : ""),
      editedAt: record.editedAt || "",
      deletedAt: record.deletedAt || "",
      reactions: Array.isArray(record.reactions) ? record.reactions.map((reaction) => ({ userId: String(reaction.userId || ""), emoji: String(reaction.emoji || "") })).filter((reaction) => reaction.userId && reaction.emoji) : []
    }));
  }

  async messageForConversation(user, otherId, messageId) {
    const me = this.idFor(user);
    await this.assertFriends(me, otherId);
    const message = await this.messages.findById(messageId);
    if (!message || message.conversationId !== this.friendshipId(me, otherId)) throw new AppError("Message not found.", 404, "MESSAGE_NOT_FOUND");
    return { me, message };
  }

  async toggleReaction(user, otherId, messageId, emoji) {
    const { me, message } = await this.messageForConversation(user, otherId, messageId);
    if (message.deletedAt) throw new AppError("A removed message cannot be reacted to.", 409, "MESSAGE_REMOVED");
    const reactions = Array.isArray(message.reactions) ? message.reactions.filter((reaction) => reaction?.userId && reaction?.emoji) : [];
    const index = reactions.findIndex((reaction) => reaction.userId === me && reaction.emoji === emoji);
    if (index >= 0) reactions.splice(index, 1);
    else reactions.push({ userId: me, emoji, createdAt: new Date().toISOString() });
    return this.messages.upsert(message.id, { ...message, reactions });
  }

  async removeMessage(user, otherId, messageId) {
    const { me, message } = await this.messageForConversation(user, otherId, messageId);
    if (message.senderId !== me) throw new AppError("You can only remove messages you sent.", 403, "FORBIDDEN");
    if (message.deletedAt) return message;
    return this.messages.upsert(message.id, { ...message, text: "", reactions: [], deletedAt: new Date().toISOString() });
  }

  async editMessage(user, otherId, messageId, text) {
    const { me, message } = await this.messageForConversation(user, otherId, messageId);
    if (message.senderId !== me) throw new AppError("You can only edit messages you sent.", 403, "FORBIDDEN");
    if (message.deletedAt) throw new AppError("A removed message cannot be edited.", 409, "MESSAGE_REMOVED");
    const value = String(text || "").trim();
    if (!value) throw new AppError("Message cannot be empty.", 422, "VALIDATION_ERROR");
    if (value.length > 4000) throw new AppError("Message must be 4,000 characters or fewer.", 422, "VALIDATION_ERROR");
    return this.messages.upsert(message.id, { ...message, text: value, editedAt: new Date().toISOString() });
  }

  async sendMessage(user, recipientId, text) {
    const senderId = this.idFor(user);
    await this.assertFriends(senderId, recipientId);
    const value = String(text || "").trim();
    if (!value) throw new AppError("Message cannot be empty.", 422, "VALIDATION_ERROR");
    if (value.length > 4000) throw new AppError("Message must be 4,000 characters or fewer.", 422, "VALIDATION_ERROR");
    const now = new Date().toISOString();
    const message = await this.messages.create({ id: randomUUID(), conversationId: this.friendshipId(senderId, recipientId), senderId, recipientId: String(recipientId), text: value, createdAt: now, readAt: "" });
    await this.notify(recipientId, "message", String(user?.name || "New message"), value, { userId: senderId, messageId: message.id });
    return message;
  }
}
