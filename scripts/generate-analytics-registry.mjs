import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'app/analytics/event-registry.json');
const outputPath = path.join(
  root,
  'mobile/lib/analytics/event_registry.g.dart'
);

const registry = JSON.parse(await readFile(sourcePath, 'utf8'));
const q = (value) =>
  `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

const eventLines = Object.entries(registry.events).map(
  ([event, definition]) => {
    const propertyLines = Object.entries(definition.properties).map(
      ([property, rule]) => {
        const values = rule.values
          ? `<String>{${rule.values.map(q).join(', ')}}`
          : 'null';
        return `      ${q(property)}: AnalyticsPropertyRule(type: ${q(rule.type)}, values: ${values}),`;
      }
    );
    return [
      `  ${q(event)}: <String, AnalyticsPropertyRule>{`,
      ...propertyLines,
      '  },',
    ].join('\n');
  }
);

const commonPropertyLines = Object.entries(registry.commonProperties).map(
  ([property, rule]) => {
    const values = rule.values
      ? `<String>{${rule.values.map(q).join(', ')}}`
      : 'null';
    return `  ${q(property)}: AnalyticsPropertyRule(type: ${q(rule.type)}, values: ${values}),`;
  }
);

const output =
  `// GENERATED FILE — source: app/analytics/event-registry.json\n` +
  `// Run: node scripts/generate-analytics-registry.mjs\n\n` +
  `final class AnalyticsPropertyRule {\n` +
  `  const AnalyticsPropertyRule({required this.type, this.values});\n\n` +
  `  final String type;\n` +
  `  final Set<String>? values;\n` +
  `}\n\n` +
  `const analyticsSchemaVersion = ${Number(registry.version)};\n\n` +
  `const analyticsCommonPropertyRegistry = <String, AnalyticsPropertyRule>{\n` +
  `${commonPropertyLines.join('\n')}\n` +
  `};\n\n` +
  `const analyticsEventRegistry = <String, Map<String, AnalyticsPropertyRule>>{\n` +
  `${eventLines.join('\n')}\n` +
  `};\n`;

if (process.argv.includes('--print')) {
  process.stdout.write(output);
} else if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  // `dart format` is authoritative for the checked-in Dart file and may wrap
  // collection literals differently from this deliberately dependency-free
  // generator. Ignore formatting-only whitespace so CI still detects changed
  // events, properties and values without requiring a Flutter SDK in this job.
  const withoutFormattingWhitespace = (value) =>
    value.replaceAll(/\s+/g, '').replaceAll(/,(?=[})])/g, '');
  if (
    withoutFormattingWhitespace(current) !== withoutFormattingWhitespace(output)
  ) {
    console.error(
      'Analytics registry is stale. Run the generator and commit its output.'
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, output);
}
