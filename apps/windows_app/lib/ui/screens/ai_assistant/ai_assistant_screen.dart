import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../state/auth_provider.dart';
import '../../widgets/ai_settings_dialog.dart';

class _ChatMessage {
  const _ChatMessage({required this.text, required this.isUser});

  final String text;
  final bool isUser;
}

/// AI 問答 chat screen — Q&A only over the user's own 記帳/代辦/專案/行事曆
/// data (no 投資/股票, by design — see `AiQueryToolsService`), no proactive
/// messages, and deliberately no server-side conversation persistence:
/// [_messages]/[_lastInteractionId] live only in this widget's own State,
/// so closing this screen (or the app) forgets the conversation entirely.
/// Continuity within one open session is carried by resending
/// [_lastInteractionId] as `previousInteractionId` on each question.
class AiAssistantScreen extends ConsumerStatefulWidget {
  const AiAssistantScreen({super.key});

  @override
  ConsumerState<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends ConsumerState<AiAssistantScreen> {
  final _messages = <_ChatMessage>[];
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  String? _lastInteractionId;
  bool _sending = false;

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final question = _inputController.text.trim();
    if (question.isEmpty || _sending) return;

    setState(() {
      _messages.add(_ChatMessage(text: question, isUser: true));
      _inputController.clear();
      _sending = true;
    });
    _scrollToBottom();

    try {
      final result = await ref
          .read(apiClientProvider)
          .askAiAssistant(question: question, previousInteractionId: _lastInteractionId);
      setState(() {
        _messages.add(_ChatMessage(text: result.answer, isUser: false));
        _lastInteractionId = result.interactionId;
      });
    } on ApiException catch (e) {
      setState(() => _messages.add(_ChatMessage(text: e.message, isUser: false)));
    } finally {
      setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI 問答'),
        actions: [
          IconButton(
            tooltip: 'AI 設定',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => showDialog(context: context, builder: (_) => const AiSettingsDialog()),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? const _EmptyState()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) => _MessageBubble(message: _messages[index]),
                  ),
          ),
          if (_sending)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: LinearProgressIndicator(minHeight: 2),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputController,
                      decoration: const InputDecoration(
                        hintText: '問問你的記帳、代辦、專案、行事曆……',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.smart_toy_outlined, size: 40, color: scheme.onSurface.withValues(alpha: 0.4)),
            const SizedBox(height: 12),
            Text(
              '問我關於你的記帳、代辦事項、專案、行事曆的問題，例如「這個月餐飲花多少」「我有哪些還沒完成的代辦」。\n（不含投資/股票查詢）',
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final _ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUser = message.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isUser ? scheme.primary.withValues(alpha: 0.14) : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: SelectableText(message.text),
      ),
    );
  }
}
