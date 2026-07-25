import 'dart:io';
import 'dart:typed_data';

/// Converts a filled `.docx` to `.pdf` by shelling out to a locally
/// installed LibreOffice — the backend's `/fill` endpoint only does text
/// substitution (docxtemplater), so this is the only place that actually
/// needs LibreOffice, and only for the "另存為 PDF"/"列印" actions. "另存為
/// Word" never needs this: the filled `.docx` bytes are already
/// byte-identical to the template's original layout.
class DocumentFillService {
  static const _candidatePaths = [
    r'C:\Program Files\LibreOffice\program\soffice.exe',
    r'C:\Program Files (x86)\LibreOffice\program\soffice.exe',
  ];

  /// Returns null if LibreOffice isn't installed at a known location, or if
  /// the conversion itself fails — callers should show a clear "install
  /// LibreOffice" message rather than a generic error in that case.
  static Future<Uint8List?> convertDocxToPdf(Uint8List docxBytes) async {
    final sofficePath = await _findSoffice();
    if (sofficePath == null) return null;

    final tempDir = await Directory.systemTemp.createTemp('life_os_doc_');
    try {
      final docxFile = File('${tempDir.path}\\input.docx');
      await docxFile.writeAsBytes(docxBytes);

      final result = await Process.run(sofficePath, [
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        tempDir.path,
        docxFile.path,
      ]);
      if (result.exitCode != 0) return null;

      final pdfFile = File('${tempDir.path}\\input.pdf');
      if (!await pdfFile.exists()) return null;
      return await pdfFile.readAsBytes();
    } finally {
      await tempDir.delete(recursive: true);
    }
  }

  static Future<String?> _findSoffice() async {
    for (final path in _candidatePaths) {
      if (await File(path).exists()) return path;
    }
    return null;
  }
}
