/// Localization delegates for the standalone UI libraries.
///
/// Keep these separate from gen-l10n output, which still emits SDK delegates.
library;

import 'package:material_ui/material_ui.dart';

import 'app_localizations.dart';

export 'package:material_ui/material_ui.dart' show GlobalMaterialLocalizations;
export 'package:cupertino_ui/cupertino_ui.dart'
    show GlobalCupertinoLocalizations;
export 'package:flutter_localizations/flutter_localizations.dart'
    show GlobalWidgetsLocalizations;

const appLocalizationDelegates = [
  AppLocalizations.delegate,
  ...GlobalMaterialLocalizations.delegates,
];
