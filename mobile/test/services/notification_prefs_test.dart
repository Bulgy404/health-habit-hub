import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/services/notification_prefs.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('all three channels default to enabled', () async {
    expect(await NotificationPrefs.habitRemindersEnabled(), isTrue);
    expect(await NotificationPrefs.questionnaireRemindersEnabled(), isTrue);
    expect(await NotificationPrefs.studyUpdatesEnabled(), isTrue);
  });

  test('setting one channel does not affect the others', () async {
    await NotificationPrefs.setHabitRemindersEnabled(false);

    expect(await NotificationPrefs.habitRemindersEnabled(), isFalse);
    expect(await NotificationPrefs.questionnaireRemindersEnabled(), isTrue);
    expect(await NotificationPrefs.studyUpdatesEnabled(), isTrue);
  });

  test('preferences persist across reads', () async {
    await NotificationPrefs.setQuestionnaireRemindersEnabled(false);
    await NotificationPrefs.setStudyUpdatesEnabled(false);

    expect(await NotificationPrefs.questionnaireRemindersEnabled(), isFalse);
    expect(await NotificationPrefs.studyUpdatesEnabled(), isFalse);
  });
}
