import 'dart:io';

import 'package:pdf/widgets.dart' as pw;

/// 工程財務四表 PDF 匯出/列印共用的中文字型——`pdf` 套件內建字型沒有中文
/// 字形，不處理的話中文字全部印成方框（tofu）。直接讀本機 Windows 系統
/// 字型檔（非隨附字型資源，元序是 Windows 專用桌面 App，這台機器一定有），
/// 標楷體（`kaiu.ttf`）是單一字型檔（非 .ttc 字型集合，`pdf` 套件的字型
/// 解析器不支援 .ttc），Windows 內建、傳統中文字形完整，且是台灣正式文件
/// 慣用字體，報價單/請款單這類正式商業文件用它反而合適。
class CjkFont {
  static pw.Font? _cached;

  static Future<pw.Font> load() async {
    final cached = _cached;
    if (cached != null) return cached;
    final bytes = await File(r'C:\Windows\Fonts\kaiu.ttf').readAsBytes();
    final font = pw.Font.ttf(bytes.buffer.asByteData());
    _cached = font;
    return font;
  }
}
