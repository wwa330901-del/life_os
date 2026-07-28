import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/document_template.dart';
import '../core/models/generated_document.dart';
import 'auth_provider.dart';

/// Every document template this space has defined (platform-admin managed,
/// see the space's 專案設定 screen).
final spaceDocumentTemplatesProvider = FutureProvider.family<List<DocumentTemplate>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listDocumentTemplates(spaceId);
});

/// The subset of a space's document templates a given project may use,
/// based on the project's own "類型" property value — what the 相關文件 tab
/// actually renders.
final projectDocumentTemplatesProvider = FutureProvider.family<List<DocumentTemplate>, String>((
  ref,
  projectId,
) {
  return ref.read(apiClientProvider).listProjectDocumentTemplates(projectId);
});

/// Documents already generated for this project (persisted records, not
/// one-shot downloads) — what the 相關文件 tab's "已產生的文件" list renders.
final generatedDocumentsProvider = FutureProvider.family<List<GeneratedDocument>, String>((
  ref,
  projectId,
) {
  return ref.read(apiClientProvider).listGeneratedDocuments(projectId);
});
