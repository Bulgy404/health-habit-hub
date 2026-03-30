import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../l10n/app_localizations.dart';
import '../widgets/offline_banner.dart';

enum LegalDocumentType { privacy, accessibility, imprint }

class LegalDocumentScreen extends ConsumerStatefulWidget {
  const LegalDocumentScreen({
    required this.documentType,
    super.key,
  });

  final LegalDocumentType documentType;

  @override
  ConsumerState<LegalDocumentScreen> createState() => _LegalDocumentScreenState();
}

class _LegalDocumentScreenState extends ConsumerState<LegalDocumentScreen> {
  WebViewController? _controller;
  bool _loading = true;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadDocument());
  }

  Future<void> _loadDocument() async {
    if (!mounted) {
      return;
    }

    setState(() {
      _loading = true;
      _offline = false;
    });

    final dio = ref.read(dioProvider);
    final locale = Localizations.localeOf(context).languageCode;

    try {
      final response = await dio.get<Map<String, dynamic>>(
        '${AppConfig.appBaseUrl}/$locale/${_pathSegment}',
        options: Options(
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      if (response.statusCode != 200) {
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
        );
      }

      final content = response.data?['content']?.toString();
      if (content == null || content.isEmpty) {
        throw StateError('Missing legal document content');
      }

      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.disabled)
        ..loadHtmlString(_wrapHtml(content));

      if (!mounted) {
        return;
      }

      setState(() {
        _controller = controller;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _offline = true;
        _loading = false;
      });
    }
  }

  String get _pathSegment => switch (widget.documentType) {
    LegalDocumentType.privacy => 'privacy',
    LegalDocumentType.accessibility => 'accessibility',
    LegalDocumentType.imprint => 'imprint',
  };

  String _title(AppLocalizations l10n) => switch (widget.documentType) {
    LegalDocumentType.privacy => l10n.privacyStatement,
    LegalDocumentType.accessibility => l10n.accessibilityStatement,
    LegalDocumentType.imprint => l10n.imprint,
  };

  String _wrapHtml(String body) {
    final title = _title(AppLocalizations.of(context)!);
    return '''
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$title</title>
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
        color: #1f2937;
        background: #ffffff;
      }
      h1, h2, h3, h4 {
        line-height: 1.25;
        margin-top: 1.25em;
      }
      a {
        color: #0f766e;
      }
      p, li {
        font-size: 16px;
      }
    </style>
  </head>
  <body>
    $body
  </body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(_title(l10n))),
      body: _offline
          ? OfflineBanner(
              message: l10n.couldNotLoadLegalDocument,
              onRetry: _loadDocument,
            )
          : _loading || _controller == null
              ? const Center(child: CircularProgressIndicator())
              : WebViewWidget(controller: _controller!),
    );
  }
}
