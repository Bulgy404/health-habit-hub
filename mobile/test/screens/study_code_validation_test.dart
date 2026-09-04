import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/screens/onboarding/study_code_screen.dart';

/// Pure validation logic, tested without the widget tree.
///
/// The client-side regex and the backend's must agree. A mobile release that
/// predates the backend change would reject valid verified codes with a
/// confusing local error — which is why the widened app build must ship
/// BEFORE any HHV code is minted.
void main() {
  group('code format acceptance', () {
    test('accepts anonymous HHH codes', () {
      expect(isValidStudyCode('HHH-ABCDE'), isTrue);
      expect(isValidStudyCode('hhh-abcde'), isTrue);
    });

    test('accepts verified HHV codes', () {
      expect(isValidStudyCode('HHV-4K7P2-9QX3R'), isTrue);
      expect(isValidStudyCode('hhv-4k7p2-9qx3r'), isTrue);
    });

    test('repairs the characters people misread off a printed sheet', () {
      // No valid code contains I, L, O or U, so repairing them can never
      // corrupt a legitimate code.
      expect(
          normalizeStudyCode('HHV-4K7PI-9QX3R'), 'HHV-4K7P1-9QX3R');
      expect(
          normalizeStudyCode('HHV-4K7PL-9QX3R'), 'HHV-4K7P1-9QX3R');
      expect(
          normalizeStudyCode('HHV-4K7PO-9QX3R'), 'HHV-4K7P0-9QX3R');
    });

    test('tolerates surrounding and internal whitespace', () {
      expect(isValidStudyCode('  HHV-4K7P2-9QX3R  '), isTrue);
      expect(normalizeStudyCode('HHV 4K7P2 9QX3R'), 'HHV4K7P29QX3R');
    });

    test('rejects malformed codes', () {
      for (final bad in <String>[
        '',
        'HHV-4K7P2',
        'HHV-4K7P2-9QX3',
        'HHX-4K7P2-9QX3R',
        'HHH-ABCD',
        'HHH-ABCDEF',
        'random text',
      ]) {
        expect(isValidStudyCode(bad), isFalse,
            reason: '"$bad" must be rejected');
      }
    });

    test('a verified code keeps its distinct prefix', () {
      // The backend routes on the prefix, so the two formats must stay
      // distinguishable after normalisation.
      expect(isValidStudyCode('HHV-4K7P2-9QX3R'), isTrue);
      expect(normalizeStudyCode('HHV-4K7P2-9QX3R').startsWith('HHV-'),
          isTrue);
    });
  });
}
