/// Whole-dollar amount with a thousands separator every 3 digits (e.g.
/// `12345.0` → `"12,345"`) — every 記帳 amount is displayed this way;
/// `TextEditingController` initial values for *editable* amount fields
/// stay as plain unformatted numbers (via `toStringAsFixed(0)`) since a
/// comma would need stripping back out before re-parsing.
String formatAmount(num value) {
  final isNegative = value < 0;
  final digits = value.abs().round().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return isNegative ? '-${buffer.toString()}' : buffer.toString();
}
