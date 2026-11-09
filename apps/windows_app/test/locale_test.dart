import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:life_os_app/app.dart';

void main() {
  testWidgets('日期選擇器是繁體中文', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: appLocale,
        supportedLocales: const [appLocale],
        localizationsDelegates: appLocalizationsDelegates,
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => showDatePicker(
              context: context,
              initialDate: DateTime(2026, 11, 9),
              firstDate: DateTime(2000),
              lastDate: DateTime(2100),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('取消'), findsOneWidget);
    expect(find.text('確定'), findsOneWidget);
    expect(find.text('2026年11月'), findsOneWidget);
    expect(find.text('Cancel'), findsNothing);
  });
}
