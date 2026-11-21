/// The backend's reply to one AI 問答 turn — [interactionId] is opaque,
/// purely for the caller to pass back as `previousInteractionId` on the
/// next question to continue the same conversation; nothing about it is
/// interpreted client-side beyond that.
class AiAssistantAnswer {
  const AiAssistantAnswer({required this.answer, required this.interactionId, this.needsConfirmation = false});

  final String answer;
  final String interactionId;

  /// AI 在問確認（記帳猜帳戶、借錢、刪除…），畫面給「確定／取消」按鈕。
  final bool needsConfirmation;

  factory AiAssistantAnswer.fromJson(Map<String, dynamic> json) => AiAssistantAnswer(
    answer: json['answer'] as String,
    interactionId: json['interactionId'] as String,
    needsConfirmation: json['needsConfirmation'] as bool? ?? false,
  );
}
