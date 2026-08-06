/// 好友 (2026-08-06) — mutual, symmetric relationship (see the backend's
/// `Friendship` schema doc comment for why). Prerequisite for 共用行事曆/
/// 借出借入互通's invite flows, which now pick a target from the friend
/// list instead of typing an email raw.
class FriendUser {
  const FriendUser({required this.id, required this.name, required this.email, this.friendshipId});

  final String id;
  final String name;
  final String email;

  /// Only present when this came from `GET /friends` (the accepted-friends
  /// list) — the underlying Friendship row's own id, needed to call
  /// `removeFriend`. Null when this is just a plain user summary (e.g.
  /// embedded in a friend-picker that doesn't need to remove anything).
  final String? friendshipId;

  factory FriendUser.fromJson(Map<String, dynamic> json) => FriendUser(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    friendshipId: json['friendshipId'] as String?,
  );
}

/// One pending invite (either direction) — [id] is the Friendship row's own
/// id (used for accept/remove), [otherUser] is always "the other person",
/// regardless of who sent it.
class FriendInvite {
  const FriendInvite({required this.id, required this.otherUser});

  final String id;
  final FriendUser otherUser;

  factory FriendInvite.fromReceivedJson(Map<String, dynamic> json) => FriendInvite(
    id: json['id'] as String,
    otherUser: FriendUser.fromJson(json['requester'] as Map<String, dynamic>),
  );

  factory FriendInvite.fromSentJson(Map<String, dynamic> json) => FriendInvite(
    id: json['id'] as String,
    otherUser: FriendUser.fromJson(json['addressee'] as Map<String, dynamic>),
  );
}
