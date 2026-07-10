import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import '../l10n/app_localizations.dart';
import '../widgets/settings_card.dart';

/// Contact + FAQ screen so participants have an in-app way to reach the
/// study team or find answers to common questions.
class HelpSupportScreen extends StatelessWidget {
  /// Creates a [HelpSupportScreen].
  ///
  /// [launcher] overrides how the "send email" action is dispatched; tests
  /// inject a fake to avoid touching platform channels.
  const HelpSupportScreen({this.launcher = launchUrl, super.key});

  /// Function used to launch the `mailto:` URI. Defaults to [launchUrl].
  final Future<bool> Function(Uri) launcher;

  Uri _mailtoUri(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final body =
        'Platform: ${Platform.operatingSystem}\nLocale: $locale\n\n'
        '---\nPlease describe your question or issue above.';
    return Uri(
      scheme: 'mailto',
      path: AppConfig.supportEmail,
      query:
          'subject=${Uri.encodeComponent('Health Habit Hub – Support Request')}'
          '&body=${Uri.encodeComponent(body)}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final faqs = <(String, String)>[
      (l10n.faqPassphraseQuestion, l10n.faqPassphraseAnswer),
      (l10n.faqDataQuestion, l10n.faqDataAnswer),
      (l10n.faqOfflineQuestion, l10n.faqOfflineAnswer),
      (l10n.faqNotificationsQuestion, l10n.faqNotificationsAnswer),
      (l10n.faqConsentQuestion, l10n.faqConsentAnswer),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.helpAndSupport)),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          const SizedBox(height: 12),
          SectionLabel(l10n.contactResearchTeam),
          SettingsCard(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
                child: Text(
                  l10n.contactResearchTeamDescription,
                  style: TextStyle(
                    fontSize: 13,
                    color: Theme.of(context).colorScheme.outline,
                  ),
                ),
              ),
              SettingsRow(
                icon: Icons.mail_outline,
                title: l10n.sendEmail,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => launcher(_mailtoUri(context)),
              ),
            ],
          ),
          SectionLabel(l10n.frequentlyAskedQuestions),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x14000000),
                    blurRadius: 20,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Material(
                type: MaterialType.transparency,
                borderRadius: BorderRadius.circular(14),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    for (final (question, answer) in faqs)
                      ExpansionTile(
                        title: Text(
                          question,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        childrenPadding: const EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          16,
                        ),
                        expandedAlignment: Alignment.centerLeft,
                        children: [
                          Text(answer, style: const TextStyle(fontSize: 13)),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
