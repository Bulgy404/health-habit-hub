/**
 * AppSettings model — MongoDB collection 'app_settings'.
 *
 * Singleton document keyed by { key: 'global' }.
 *
 * Schema:
 *   key                        string    Always 'global' (singleton key)
 *   guidedHabitCreationEnabled boolean   Whether the guided wizard is enabled for public users
 *   communityShareDefault      boolean   Whether the community share toggle is shown/pre-checked
 *   updatedAt                  Date
 */

export const COLLECTION = 'app_settings';

export const DEFAULTS = {
  guidedHabitCreationEnabled: true,
  communityShareDefault: true,
};
