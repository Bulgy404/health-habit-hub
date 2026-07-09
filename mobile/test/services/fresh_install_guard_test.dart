import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/services/fresh_install_guard.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockFlutterSecureStorage extends FlutterSecureStorage {
  int deleteAllCalls = 0;

  @override
  Future<void> deleteAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    deleteAllCalls++;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('wipes secure storage and sets the flag on first launch', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final storage = _MockFlutterSecureStorage();

    await ensureFreshInstallState(preferences: prefs, secureStorage: storage);

    expect(storage.deleteAllCalls, 1);
    expect(prefs.getBool('has_launched_before'), isTrue);
  });

  test('does not wipe secure storage on subsequent launches', () async {
    SharedPreferences.setMockInitialValues({'has_launched_before': true});
    final prefs = await SharedPreferences.getInstance();
    final storage = _MockFlutterSecureStorage();

    await ensureFreshInstallState(preferences: prefs, secureStorage: storage);

    expect(storage.deleteAllCalls, 0);
  });
}
