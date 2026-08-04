/// The backend's reply to one AI 問答 turn — [interactionId] is opaque,
/// purely for the caller to pass back as `previousInteractionId` on the
/// next question to continue the same conversation; nothing about it is
/// interpreted client-side beyond that.
class AiAssistantAnswer {
  const AiAssistantAnswer({required this.answer, required this.interactionId});

  final String answer;
  final String interactionId;

  factory AiAssistantAnswer.fromJson(Map<String, dynamic> json) => AiAssistantAnswer(
    answer: json['answer'] as String,
    interactionId: json['interactionId'] as String,
  );
}
